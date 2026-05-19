import { Phase2HttpError } from './phase2Errors.ts';
import {
  isRecord,
  readOptionalString,
} from './phase2Utils.ts';
import {
  hasCoachPersonaAccess,
  isCoachPersonaKey,
  type CoachPersonaKey,
} from '../../../shared/coachPersonas.ts';
import type { CoachAccountTier } from './coachTier.ts';

export const COACH_CONVERSATION_INVALID_PAYLOAD_ERROR_CODE =
  'invalid_coach_conversation_payload';
export const COACH_CONVERSATION_PERSONA_REQUIRES_PREMIUM_ERROR_CODE =
  'coach_conversation_persona_requires_premium';

export const COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH = 2000;
export const COACH_CONVERSATION_ASSISTANT_MESSAGE_MAX_LENGTH = 8000;
export const COACH_CONVERSATION_SLIDING_WINDOW_SIZE = 12;

const ALLOWED_LOCALES = new Set([
  'fr',
  'en',
  'de',
  'it',
  'es',
  'pt',
]);

const ZERO_WIDTH_PATTERN = /[​-‍﻿]/g;
const MULTI_NEWLINE_PATTERN = /\n{4,}/g;

export interface CoachConversationStoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  status: string;
}

export interface CoachConversationStartRequest {
  persona_key: CoachPersonaKey;
  locale: string | null;
  first_message?: {
    content: string;
    client_request_id?: string | null;
  } | null;
}

export interface CoachSendMessageRequest {
  conversation_id: string;
  content: string;
  client_request_id?: string | null;
}

function bail(message: string, code = COACH_CONVERSATION_INVALID_PAYLOAD_ERROR_CODE): never {
  throw new Phase2HttpError(400, code, message);
}

function normalizeContent(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    bail('Message content must be a string');
  }
  const trimmed = value.replace(ZERO_WIDTH_PATTERN, '').replace(MULTI_NEWLINE_PATTERN, '\n\n\n').trim();
  if (trimmed.length === 0) {
    bail('Message content cannot be empty');
  }
  if (trimmed.length > maxLength) {
    bail(`Message content must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase().slice(0, 5);
  if (!lower) return null;
  const head = lower.split(/[-_]/)[0];
  return ALLOWED_LOCALES.has(head) ? head : null;
}

function normalizeClientRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) {
    bail('client_request_id must be 80 characters or fewer');
  }
  if (!/^[A-Za-z0-9_:.-]+$/.test(trimmed)) {
    bail('client_request_id contains invalid characters');
  }
  return trimmed;
}

export function parseCoachConversationStartRequest(
  payload: unknown,
): CoachConversationStartRequest {
  if (!isRecord(payload)) {
    bail('Request body must be a JSON object');
  }

  const personaKeyRaw = readOptionalString(payload.persona_key);
  if (!personaKeyRaw || !isCoachPersonaKey(personaKeyRaw)) {
    bail('persona_key must be one of the supported Coach personas');
  }
  const personaKey = personaKeyRaw as CoachPersonaKey;

  const locale = normalizeLocale(payload.locale);

  let firstMessage: CoachConversationStartRequest['first_message'] = null;
  if (payload.first_message !== undefined && payload.first_message !== null) {
    if (!isRecord(payload.first_message)) {
      bail('first_message must be an object');
    }
    firstMessage = {
      content: normalizeContent(
        payload.first_message.content,
        COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH,
      ),
      client_request_id: normalizeClientRequestId(
        payload.first_message.client_request_id,
      ),
    };
  }

  return {
    persona_key: personaKey,
    locale,
    first_message: firstMessage,
  };
}

export function parseCoachSendMessageRequest(
  payload: unknown,
): CoachSendMessageRequest {
  if (!isRecord(payload)) {
    bail('Request body must be a JSON object');
  }

  const conversationId = readOptionalString(payload.conversation_id);
  if (!conversationId || !/^[0-9a-fA-F-]{36}$/.test(conversationId)) {
    bail('conversation_id must be a UUID');
  }

  const content = normalizeContent(
    payload.content,
    COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH,
  );
  const clientRequestId = normalizeClientRequestId(payload.client_request_id);

  return {
    conversation_id: conversationId,
    content,
    client_request_id: clientRequestId,
  };
}

export function assertPersonaAccessible(
  personaKey: CoachPersonaKey,
  accountTier: CoachAccountTier,
) {
  if (!hasCoachPersonaAccess(personaKey, accountTier)) {
    throw new Phase2HttpError(
      403,
      COACH_CONVERSATION_PERSONA_REQUIRES_PREMIUM_ERROR_CODE,
      'Selected Coach persona requires a premium subscription',
    );
  }
}

export function getDefaultCoachWelcomeMessage(
  locale: string | null,
  accountTier: CoachAccountTier,
): string {
  const isFree = accountTier === 'free';
  const trimmed = (locale ?? 'fr').toLowerCase();

  // Short, plain-text welcomes. The Edge Function writes them as a system
  // message at conversation start. They must NOT consume the user's quota.
  const dictionary: Record<string, { free: string; premium: string }> = {
    fr: {
      free:
        "Bienvenue. Ceci est ta conversation gratuite avec ton coach. Tu peux poser jusqu'à 4 questions. Lance-toi !",
      premium:
        'Bienvenue. Je suis ton coach. Pose toutes tes questions, je suis là pour t\'aider.',
    },
    en: {
      free:
        "Welcome. This is your free conversation with the coach. You can ask up to 4 questions. Go ahead.",
      premium:
        "Welcome. I'm your coach. Ask anything, I'm here to help.",
    },
    de: {
      free:
        'Willkommen. Dies ist dein kostenloses Gespräch mit dem Coach. Du kannst bis zu 4 Fragen stellen. Leg los.',
      premium:
        'Willkommen. Ich bin dein Coach. Stell mir alle Fragen, ich helfe dir.',
    },
    it: {
      free:
        'Benvenuto. Questa è la tua conversazione gratuita con il coach. Puoi fare fino a 4 domande. Inizia pure.',
      premium:
        'Benvenuto. Sono il tuo coach. Fai pure tutte le domande che vuoi.',
    },
    es: {
      free:
        'Bienvenido. Esta es tu conversación gratuita con el coach. Puedes hacer hasta 4 preguntas. Adelante.',
      premium:
        'Bienvenido. Soy tu coach. Pregunta lo que quieras, estoy aquí para ayudarte.',
    },
    pt: {
      free:
        'Bem-vindo. Esta é a sua conversa gratuita com o coach. Você pode fazer até 4 perguntas. Vamos lá.',
      premium:
        'Bem-vindo. Sou o seu coach. Faça todas as suas perguntas, estou aqui para ajudar.',
    },
  };

  const entry = dictionary[trimmed] ?? dictionary.fr;
  return isFree ? entry.free : entry.premium;
}

export function buildSlidingWindowMessages(
  messages: CoachConversationStoredMessage[],
  newUserContent: string,
  size = COACH_CONVERSATION_SLIDING_WINDOW_SIZE,
): { role: 'user' | 'assistant' | 'system'; content: string }[] {
  const ready = messages
    .filter((message) => message.status === 'ready' || message.status === 'streaming')
    .map((message) => ({ role: message.role, content: message.content }))
    .filter((entry) => entry.content.trim().length > 0);

  const window = ready.slice(-Math.max(1, size));
  return [
    ...window,
    { role: 'user', content: newUserContent },
  ];
}
