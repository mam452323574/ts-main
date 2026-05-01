import type { ZodTypeAny } from 'zod';

import { getRuntimeConfig, getSupabaseFunctionUrl } from './runtimeConfig';
import { supabase } from './supabase';

interface EdgeFunctionErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
  status?: number;
  request_id?: string;
}

export interface EdgeFunctionInvokeErrorOptions {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  functionName: string;
}

interface InvokeAuthedEdgeFunctionOptions<TError extends Error> {
  scopeLabel: string;
  functionName: string;
  payload: Record<string, unknown>;
  createError: (message: string, options: EdgeFunctionInvokeErrorOptions) => TError;
  // P2-B Phase 2 — schéma Zod optionnel pour valider la réponse Edge Function.
  // Si fourni, un payload qui ne matche pas le schéma fait throw via createError
  // au lieu d'être renvoyé tel quel (cast brut as TResponse). Le retour reste
  // typé `TResponse` côté caller — le caller assume la concordance entre son
  // type attendu et son schéma.
  responseSchema?: ZodTypeAny;
}

function shouldDebugEdgeFunctions() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readEdgeFunctionErrorPayload(value: unknown): EdgeFunctionErrorPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    error: typeof value.error === 'string' ? value.error : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
    details: value.details,
    status: typeof value.status === 'number' ? value.status : undefined,
    request_id: typeof value.request_id === 'string' ? value.request_id : undefined,
  };
}

function extractSupabaseProjectRef(supabaseUrl: string) {
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co(?:\/|$)/i);
  return match?.[1] ?? null;
}

export function getConfiguredSupabaseProjectLabel() {
  try {
    const supabaseUrl = getRuntimeConfig().supabaseUrl;
    return extractSupabaseProjectRef(supabaseUrl) ?? supabaseUrl;
  } catch {
    return 'configured project';
  }
}

export function createMissingEdgeFunctionRouteMessage(
  scopeLabel: string,
  functionName: string,
) {
  return `${scopeLabel} route "${functionName}" is not deployed on Supabase project "${getConfiguredSupabaseProjectLabel()}" (404).`;
}

export async function invokeAuthedEdgeFunction<TResponse, TError extends Error>({
  scopeLabel,
  functionName,
  payload,
  createError,
  responseSchema,
}: InvokeAuthedEdgeFunctionOptions<TError>): Promise<TResponse> {
  let functionUrl: string;

  try {
    functionUrl = getSupabaseFunctionUrl(functionName);
  } catch {
    throw createError('Supabase URL is not configured', {
      code: 'missing_supabase_url',
      status: 500,
      functionName,
    });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw createError('Authentication required', {
      code: 'missing_authentication',
      status: 401,
      functionName,
    });
  }

  let response: Response;
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json; charset=utf-8',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (shouldDebugEdgeFunctions()) {
      console.log('[EdgeFunction] network failure', {
        scope_label: scopeLabel,
        function_name: functionName,
        function_url: functionUrl,
        supabase_project: getConfiguredSupabaseProjectLabel(),
        status: null,
        code: 'edge_function_network_error',
        request_id: null,
        details: error,
      });
    }

    throw createError(
      error instanceof Error
        ? error.message
        : `${scopeLabel} route "${functionName}" could not be reached.`,
      {
        code: 'edge_function_network_error',
        details: error,
        functionName,
      },
    );
  }

  const responseText = await response.text();
  let responsePayload: unknown = null;
  if (responseText.trim().length > 0) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = readEdgeFunctionErrorPayload(responsePayload);
    const isMissingRoute = response.status === 404;
    const errorMessage =
      isMissingRoute
        ? createMissingEdgeFunctionRouteMessage(scopeLabel, functionName)
        : errorPayload.error ??
          errorPayload.message ??
          `${scopeLabel} route "${functionName}" failed (${response.status}).`;

    if (shouldDebugEdgeFunctions()) {
      console.log('[EdgeFunction] invoke failed', {
        scope_label: scopeLabel,
        function_name: functionName,
        function_url: functionUrl,
        supabase_project: getConfiguredSupabaseProjectLabel(),
        status: errorPayload.status ?? response.status,
        code: errorPayload.code ?? (isMissingRoute ? 'edge_function_route_missing' : null),
        request_id: errorPayload.request_id ?? null,
        details: errorPayload.details ?? responsePayload,
        message: errorMessage,
      });
    }

    throw createError(
      errorMessage,
      {
        code: errorPayload.code ?? (isMissingRoute ? 'edge_function_route_missing' : undefined),
        status: errorPayload.status ?? response.status,
        details: errorPayload.details ?? responsePayload,
        requestId: errorPayload.request_id,
        functionName,
      },
    );
  }

  if (responseSchema) {
    const validation = responseSchema.safeParse(responsePayload);
    if (!validation.success) {
      if (shouldDebugEdgeFunctions()) {
        console.log('[EdgeFunction] response schema mismatch', {
          scope_label: scopeLabel,
          function_name: functionName,
          issues: validation.error.issues,
        });
      }
      throw createError(
        `${scopeLabel} route "${functionName}" returned an invalid payload.`,
        {
          code: 'edge_function_invalid_response',
          status: response.status,
          details: validation.error.issues,
          functionName,
        },
      );
    }
    return validation.data as TResponse;
  }

  return responsePayload as TResponse;
}
