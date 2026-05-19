/**
 * Server-side helpers to relay a Coach conversation reply to the mobile client
 * as Server-Sent Events (SSE). n8n returns the assistant content synchronously
 * — the Edge Function chunks it on the wire so the UI can render a "typing"
 * effect even though the upstream LLM call is not streamed.
 *
 * SSE wire format:
 *   event: ready
 *   data: <JSON with conversation_id, user_message, etc.>
 *
 *   event: chunk
 *   data: {"delta":"Hello"}
 *
 *   event: complete
 *   data: <JSON with the final assistant message>
 *
 *   event: error
 *   data: {"code":"...","message":"..."}
 *
 *   event: done
 *   data: {}
 *
 * Clients should treat `event: error` and `event: done` as terminal.
 */

import { Phase2HttpError, toPhase2ErrorPayload } from './phase2Errors.ts';

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_CHUNK_INTERVAL_MS = 24;
const DEFAULT_MAX_CHUNK_SIZE = 32;

const textEncoder = new TextEncoder();

export interface CoachConversationStreamWriter {
  ready: (payload: Record<string, unknown>) => Promise<void>;
  chunk: (delta: string) => Promise<void>;
  complete: (payload: Record<string, unknown>) => Promise<void>;
  error: (error: unknown, requestId: string | null) => Promise<void>;
  close: () => Promise<void>;
}

function buildSseEvent(name: string, data: unknown): Uint8Array {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  return textEncoder.encode(`event: ${name}\ndata: ${serialized}\n\n`);
}

function buildSseComment(text: string): Uint8Array {
  return textEncoder.encode(`: ${text}\n\n`);
}

export function chunkAssistantContent(
  content: string,
  options: { maxChunkSize?: number } = {},
): string[] {
  const maxChunkSize = Math.max(8, options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE);
  if (!content) return [];

  const segments: string[] = [];
  const words = content.split(/(\s+)/);
  let buffer = '';

  for (const piece of words) {
    if (buffer.length + piece.length > maxChunkSize && buffer.length > 0) {
      segments.push(buffer);
      buffer = piece;
    } else {
      buffer += piece;
    }
  }

  if (buffer.length > 0) {
    segments.push(buffer);
  }

  return segments;
}

export function createCoachConversationStreamResponse(
  req: Request,
  options: {
    corsHeaders: Record<string, string>;
    handle: (writer: CoachConversationStreamWriter) => Promise<void>;
    requestId: string;
  },
): Response {
  const { corsHeaders, handle, requestId } = options;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let closed = false;

  const safeWrite = async (chunk: Uint8Array) => {
    if (closed) return;
    try {
      await writer.write(chunk);
    } catch {
      closed = true;
    }
  };

  const heartbeat = setInterval(() => {
    void safeWrite(buildSseComment('keepalive'));
  }, SSE_HEARTBEAT_INTERVAL_MS);

  const streamWriter: CoachConversationStreamWriter = {
    async ready(payload) {
      await safeWrite(buildSseEvent('ready', payload));
    },
    async chunk(delta) {
      if (!delta) return;
      await safeWrite(buildSseEvent('chunk', { delta }));
    },
    async complete(payload) {
      await safeWrite(buildSseEvent('complete', payload));
    },
    async error(error, errorRequestId) {
      const payload = toPhase2ErrorPayload(error, {
        requestId: errorRequestId ?? requestId,
      });
      await safeWrite(buildSseEvent('error', payload));
    },
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      await safeWrite(buildSseEvent('done', {}));
      try {
        await writer.close();
      } catch {
        // ignore
      }
    },
  };

  (async () => {
    try {
      await handle(streamWriter);
    } catch (error) {
      await streamWriter.error(error, requestId);
    } finally {
      await streamWriter.close();
    }
  })();

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');
  headers.set('Pragma', 'no-cache');

  return new Response(readable, {
    status: 200,
    headers,
  });
}

export async function streamAssistantContent(
  writer: CoachConversationStreamWriter,
  content: string,
  options: { maxChunkSize?: number; chunkIntervalMs?: number } = {},
) {
  const chunks = chunkAssistantContent(content, options);
  const interval = Math.max(0, options.chunkIntervalMs ?? DEFAULT_CHUNK_INTERVAL_MS);
  for (const chunk of chunks) {
    await writer.chunk(chunk);
    if (interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

export function isStreamableHttpError(error: unknown): error is Phase2HttpError {
  return error instanceof Phase2HttpError;
}
