import { readCoachProfileMemory } from './coachProfileMemory.ts';
import { logPhase2Error } from './phase2Observability.ts';
import { isRecord, readOptionalString } from './phase2Utils.ts';

export interface CoachRecentScanDigestEntry {
  scan_type: string;
  captured_at: string;
  overall_score?: number;
  summary?: string;
  top_findings?: string[];
}

export interface CoachUserContext {
  inferred_persona?: Record<string, unknown>;
  recent_scan_digest?: CoachRecentScanDigestEntry[];
}

const COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT = 3;
const SUMMARY_MAX_LENGTH = 200;
const FINDING_MAX_LENGTH = 80;
const FINDINGS_MAX_COUNT = 2;
const TRUNCATION_SUFFIX = '…';

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

function readBoundedScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 100) return undefined;
  return value;
}

function pickOverallScore(analysisResult: Record<string, unknown>): number | undefined {
  const direct =
    readBoundedScore(analysisResult.overall_score) ??
    readBoundedScore(analysisResult.score);
  if (direct !== undefined) return direct;
  const nestedSummary = analysisResult.summary;
  if (isRecord(nestedSummary)) {
    return readBoundedScore(nestedSummary.score);
  }
  return undefined;
}

function pickSummary(analysisResult: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    analysisResult.analysis_summary,
    analysisResult.summary,
    analysisResult.summary_text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const clamped = clampString(candidate, SUMMARY_MAX_LENGTH);
    if (clamped) return clamped;
  }
  return undefined;
}

function pickTopFindings(analysisResult: Record<string, unknown>): string[] | undefined {
  const sources: unknown[] = [
    analysisResult.findings,
    analysisResult.recommendations,
    analysisResult.top_issues,
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const items: string[] = [];
    for (const candidate of source) {
      const clamped = clampString(candidate, FINDING_MAX_LENGTH);
      if (clamped) items.push(clamped);
      if (items.length >= FINDINGS_MAX_COUNT) break;
    }
    if (items.length > 0) return items;
  }
  return undefined;
}

function readCapturedAt(row: Record<string, unknown>): string | null {
  return (
    readOptionalString(row.analyzed_at) ??
    readOptionalString(row.created_at)
  );
}

function mapScanRowToDigest(row: unknown): CoachRecentScanDigestEntry | null {
  if (!isRecord(row)) return null;
  const scanType = readOptionalString(row.scan_type);
  const capturedAt = readCapturedAt(row);
  if (!scanType || !capturedAt) return null;

  const entry: CoachRecentScanDigestEntry = {
    scan_type: scanType,
    captured_at: capturedAt,
  };

  const analysis = row.analysis_result;
  if (isRecord(analysis)) {
    const overallScore = pickOverallScore(analysis);
    if (overallScore !== undefined) entry.overall_score = overallScore;
    const summary = pickSummary(analysis);
    if (summary) entry.summary = summary;
    const findings = pickTopFindings(analysis);
    if (findings) entry.top_findings = findings;
  }

  return entry;
}

export async function buildRecentScanDigest(
  client: any,
  userId: string,
  limit: number = COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT,
): Promise<CoachRecentScanDigestEntry[]> {
  const { data, error } = await client
    .from('scans')
    .select('id, scan_type, analysis_result, analyzed_at, created_at')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) return [];

  const digest: CoachRecentScanDigestEntry[] = [];
  for (const row of data) {
    const entry = mapScanRowToDigest(row);
    if (entry) digest.push(entry);
  }
  return digest;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

export async function buildCoachUserContext(
  client: any,
  userId: string,
  requestId: string,
): Promise<CoachUserContext | null> {
  const [profileResult, digestResult] = await Promise.allSettled([
    readCoachProfileMemory(client, userId),
    buildRecentScanDigest(client, userId),
  ]);

  const context: CoachUserContext = {};

  if (profileResult.status === 'fulfilled') {
    if (isNonEmptyRecord(profileResult.value)) {
      context.inferred_persona = profileResult.value;
    }
  } else {
    logPhase2Error(
      '[coach-send-message] user_context fetch degraded',
      profileResult.reason,
      { request_id: requestId, kind: 'profile' },
    );
  }

  if (digestResult.status === 'fulfilled') {
    if (digestResult.value.length > 0) {
      context.recent_scan_digest = digestResult.value;
    }
  } else {
    logPhase2Error(
      '[coach-send-message] user_context fetch degraded',
      digestResult.reason,
      { request_id: requestId, kind: 'scans' },
    );
  }

  if (Object.keys(context).length === 0) {
    return null;
  }

  return context;
}
