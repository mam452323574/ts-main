export class Phase2HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'Phase2HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const PHASE2_SENSITIVE_DETAIL_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|session|payload|webhook_text|response_text|raw_body|request_body|email)/i;

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export type Phase2DatabaseErrorCategory =
  | 'missing_relation'
  | 'missing_column'
  | 'missing_rpc'
  | 'policy_denied'
  | 'malformed_payload'
  | 'constraint_failure'
  | 'transient_failure'
  | 'unknown';

export interface Phase2DatabaseErrorClassification {
  category: Phase2DatabaseErrorCategory;
  sourceCode?: string;
  relation?: string | null;
  column?: string | null;
  rpc?: string | null;
}

interface CreatePhase2DatabaseErrorOptions {
  contextLabel: string;
  fallbackCode: string;
  fallbackMessage: string;
  relationName?: string;
  rpcName?: string;
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function buildSupabaseErrorMessages(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);

  return [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function buildSupabaseErrorHaystack(error: unknown) {
  return buildSupabaseErrorMessages(error).join(' ').toLowerCase();
}

function extractFirstMatch(messages: string[], patterns: RegExp[]) {
  for (const message of messages) {
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
  }

  return null;
}

function extractRelationName(messages: string[]) {
  return extractFirstMatch(messages, [
    /relation ["']?([a-zA-Z0-9_.]+)["']?/i,
    /table ["']?([a-zA-Z0-9_.]+)["']?/i,
  ]);
}

function extractColumnName(messages: string[]) {
  return extractFirstMatch(messages, [
    /column reference ["']?([a-zA-Z0-9_.]+)["']?/i,
    /column ["']([a-zA-Z0-9_.]+)["']/i,
    /["']([a-zA-Z0-9_.]+)["'] column/i,
    /column ([a-zA-Z0-9_.]+) does not exist/i,
  ]);
}

function extractRpcName(messages: string[]) {
  const directFunctionMatch = extractFirstMatch(messages, [
    /function ["']?([a-zA-Z0-9_.]+)["']?/i,
    /could not find (?:the )?function ["']?([a-zA-Z0-9_.]+)["']?/i,
  ]);

  if (directFunctionMatch) {
    return directFunctionMatch.replace(/^public\./i, '');
  }

  return null;
}

export function classifySupabaseDatabaseError(
  error: unknown,
): Phase2DatabaseErrorClassification {
  const supabaseError = toSupabaseErrorLike(error);
  const messages = buildSupabaseErrorMessages(error);
  const haystack = buildSupabaseErrorHaystack(error);
  const sourceCode = supabaseError.code;
  const relation = extractRelationName(messages);
  const column = extractColumnName(messages);
  const rpc = extractRpcName(messages);

  if (
    sourceCode === '42P01' ||
    sourceCode === 'PGRST205' ||
    haystack.includes('relation') && haystack.includes('does not exist')
  ) {
    return {
      category: 'missing_relation',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    sourceCode === '42703' ||
    sourceCode === 'PGRST204' ||
    haystack.includes('column') && haystack.includes('does not exist')
  ) {
    return {
      category: 'missing_column',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    sourceCode === '42883' ||
    sourceCode === 'PGRST202' ||
    haystack.includes('function') && haystack.includes('does not exist') ||
    haystack.includes('could not find function')
  ) {
    return {
      category: 'missing_rpc',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    sourceCode === '42501' ||
    haystack.includes('permission denied') ||
    haystack.includes('row-level security')
  ) {
    return {
      category: 'policy_denied',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    sourceCode === '22P02' ||
    sourceCode === '22023' ||
    sourceCode === 'PGRST100' ||
    haystack.includes('invalid input syntax') ||
    haystack.includes('malformed')
  ) {
    return {
      category: 'malformed_payload',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    sourceCode === '23502' ||
    sourceCode === '23503' ||
    sourceCode === '23505' ||
    sourceCode === '23514' ||
    sourceCode === '23P01'
  ) {
    return {
      category: 'constraint_failure',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  if (
    (typeof sourceCode === 'string' && sourceCode.startsWith('08')) ||
    sourceCode === '57P01' ||
    sourceCode === '57P02' ||
    sourceCode === '57P03' ||
    sourceCode === '53300' ||
    sourceCode === '53400' ||
    haystack.includes('connection refused') ||
    haystack.includes('terminating connection') ||
    haystack.includes('too many connections')
  ) {
    return {
      category: 'transient_failure',
      sourceCode,
      relation,
      column,
      rpc,
    };
  }

  return {
    category: 'unknown',
    sourceCode,
    relation,
    column,
    rpc,
  };
}

export function createPhase2DatabaseError(
  error: unknown,
  options: CreatePhase2DatabaseErrorOptions,
) {
  const classification = classifySupabaseDatabaseError(error);
  const relationName = classification.relation ?? options.relationName ?? null;
  const columnName = classification.column ?? null;
  const rpcName = classification.rpc ?? options.rpcName ?? null;

  switch (classification.category) {
    case 'missing_relation':
      return new Phase2HttpError(
        503,
        'database_relation_missing',
        relationName
          ? `${options.contextLabel} requires the "${relationName}" table on the configured Supabase project.`
          : `${options.contextLabel} requires a missing database table on the configured Supabase project.`,
        {
          source_code: classification.sourceCode,
          relation: relationName ?? undefined,
        },
      );
    case 'missing_column':
      return new Phase2HttpError(
        503,
        'database_column_missing',
        columnName
          ? `${options.contextLabel} requires the "${columnName}" column on the configured Supabase project.`
          : `${options.contextLabel} requires a missing database column on the configured Supabase project.`,
        {
          source_code: classification.sourceCode,
          relation: relationName ?? undefined,
          column: columnName ?? undefined,
        },
      );
    case 'missing_rpc':
      return new Phase2HttpError(
        503,
        'database_rpc_missing',
        rpcName
          ? `${options.contextLabel} requires the "${rpcName}" database function on the configured Supabase project.`
          : `${options.contextLabel} requires a missing database function on the configured Supabase project.`,
        {
          source_code: classification.sourceCode,
          rpc: rpcName ?? undefined,
        },
      );
    case 'policy_denied':
      return new Phase2HttpError(
        403,
        'database_policy_denied',
        relationName
          ? `${options.contextLabel} is denied by Supabase policies or grants for "${relationName}".`
          : `${options.contextLabel} is denied by Supabase policies or grants.`,
        {
          source_code: classification.sourceCode,
          relation: relationName ?? undefined,
        },
      );
    case 'malformed_payload':
      return new Phase2HttpError(
        400,
        'database_malformed_payload',
        `${options.contextLabel} failed because the database rejected the payload.`,
        {
          source_code: classification.sourceCode,
        },
      );
    case 'constraint_failure':
      return new Phase2HttpError(
        classification.sourceCode === '23505' ? 409 : 400,
        'database_constraint_violation',
        `${options.contextLabel} failed because the database rejected the write constraints.`,
        {
          source_code: classification.sourceCode,
          relation: relationName ?? undefined,
          column: columnName ?? undefined,
        },
      );
    case 'transient_failure':
      return new Phase2HttpError(
        503,
        'database_transient_failure',
        `${options.contextLabel} failed because Supabase is temporarily unavailable.`,
        {
          source_code: classification.sourceCode,
        },
      );
    case 'unknown':
    default:
      return new Phase2HttpError(500, options.fallbackCode, options.fallbackMessage, {
        source_code: classification.sourceCode,
        relation: relationName ?? undefined,
        column: columnName ?? undefined,
        rpc: rpcName ?? undefined,
      });
  }
}

export function getPhase2ErrorStatus(error: unknown) {
  return error instanceof Phase2HttpError ? error.status : 500;
}

function sanitizePhase2ErrorDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(details).filter((entry) => {
    const [key, value] = entry;
    if (PHASE2_SENSITIVE_DETAIL_KEY_PATTERN.test(key)) {
      return false;
    }

    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  });

  return sanitizedEntries.length > 0
    ? Object.fromEntries(sanitizedEntries)
    : undefined;
}

export function toPhase2ErrorPayload(
  error: unknown,
  options: {
    requestId?: string;
    eventId?: string;
  } = {},
) {
  const basePayload = {
    ...(options.requestId ? { request_id: options.requestId } : {}),
    ...(options.eventId ? { event_id: options.eventId } : {}),
  };

  if (error instanceof Phase2HttpError) {
    const details = sanitizePhase2ErrorDetails(error.details);

    return {
      success: false,
      error: error.message,
      code: error.code,
      status: error.status,
      ...(details ? { details } : {}),
      ...basePayload,
    };
  }

  return {
    success: false,
    error: 'Unexpected server error',
    code: 'internal_error',
    status: 500,
    ...basePayload,
  };
}
