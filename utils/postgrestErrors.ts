/**
 * Extract the missing column name from a PostgREST PGRST204 schema cache error.
 * PostgREST formats these messages like:
 *   "Could not find the 'face_collagen_level' column of 'scan_metrics' in the schema cache"
 *
 * Returns the column name, or undefined if it cannot be parsed.
 */
export function extractMissingColumnFromPgrstError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;
  const errorMessages = [
    errorRecord.message,
    errorRecord.details,
    errorRecord.hint,
  ].filter((value): value is string => typeof value === 'string');

  for (const errorMessage of errorMessages) {
    const quotedMatch = errorMessage.match(/'([^']+)' column/i);
    if (quotedMatch?.[1]) {
      return quotedMatch[1];
    }

    const directMatch = errorMessage.match(/\bcolumn\s+([a-z_][a-z0-9_]*)\b/i);
    if (directMatch?.[1]) {
      return directMatch[1];
    }
  }

  return undefined;
}

export function isPostgrestSchemaCacheMissError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'PGRST204';
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === '23505';
}
