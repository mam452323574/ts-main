import {
  COACH_CONTENT_LIMITS,
  CoachConfidence,
  CoachPrimaryMetricDelta,
  CoachProfileUpdateStructured,
  CoachResponseVersion,
  CoachStructuredContent,
  isCoachConfidence,
  isCoachMetricDirection,
  isCoachMetricInterpretation,
  isCoachMetricMagnitude,
  isCoachProfileUpdateFocus,
  isCoachResponseVersion,
} from './coachContent.ts';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function clampOptionalString(value: unknown, max: number): string | null {
  const clamped = clampString(value, max);
  return clamped.length > 0 ? clamped : null;
}

function clampStringArray(
  value: unknown,
  maxItems: number,
  maxCharsPerItem: number,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: string[] = [];
  for (const raw of value) {
    if (items.length >= maxItems) {
      break;
    }

    const clamped = clampString(raw, maxCharsPerItem);
    if (clamped.length > 0) {
      items.push(clamped);
    }
  }

  return items;
}

function parseProfileUpdates(
  value: unknown,
): CoachProfileUpdateStructured | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const dietSignals = clampStringArray(
    value.detected_diet_signals,
    COACH_CONTENT_LIMITS.dietSignalsMax,
    COACH_CONTENT_LIMITS.dietSignal,
  );
  const goals = clampStringArray(
    value.suggested_goals,
    COACH_CONTENT_LIMITS.goalsMax,
    COACH_CONTENT_LIMITS.goal,
  );
  const detectedStrongFocus = isCoachProfileUpdateFocus(value.detected_strong_focus)
    ? value.detected_strong_focus
    : null;
  const suggestedPersonaKey = clampOptionalString(
    value.suggested_persona_key,
    COACH_CONTENT_LIMITS.personaKey,
  );

  const hasAnyContent =
    dietSignals.length > 0 ||
    goals.length > 0 ||
    detectedStrongFocus !== null ||
    suggestedPersonaKey !== null;

  if (!hasAnyContent) {
    return null;
  }

  return {
    detected_diet_signals: dietSignals,
    detected_strong_focus: detectedStrongFocus,
    suggested_goals: goals,
    suggested_persona_key: suggestedPersonaKey,
  };
}

function parsePrimaryMetricDelta(
  value: unknown,
): CoachPrimaryMetricDelta | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const metricKey = clampString(value.metric_key, COACH_CONTENT_LIMITS.metricKey);
  const humanLabel = clampString(
    value.human_label,
    COACH_CONTENT_LIMITS.metricHumanLabel,
  );

  if (!metricKey || !humanLabel) {
    return null;
  }

  if (
    !isCoachMetricDirection(value.direction) ||
    !isCoachMetricMagnitude(value.magnitude) ||
    !isCoachMetricInterpretation(value.interpretation)
  ) {
    return null;
  }

  return {
    metric_key: metricKey,
    human_label: humanLabel,
    direction: value.direction,
    magnitude: value.magnitude,
    interpretation: value.interpretation,
  };
}

export interface ParseCoachContentOptions {
  fallbackTitle?: string | null;
}

export interface ParsedCoachContentResult {
  content: CoachStructuredContent | null;
  version: CoachResponseVersion;
  synthesizedBody: string;
  warnings: string[];
}

export function synthesizeCoachBody(
  content: CoachStructuredContent | null,
): string {
  if (!content) {
    return '';
  }

  const parts: string[] = [];

  if (content.summary) {
    parts.push(content.summary);
  }

  if (content.context_notes.length > 0) {
    parts.push(content.context_notes.map((note) => `• ${note}`).join('\n'));
  }

  if (content.priorities.length > 0) {
    parts.push(content.priorities.map((priority) => `→ ${priority}`).join('\n'));
  }

  if (content.action_steps.length > 0) {
    parts.push(content.action_steps.map((step) => `✓ ${step}`).join('\n'));
  }

  if (content.warnings.length > 0) {
    parts.push(content.warnings.map((warning) => `⚠ ${warning}`).join('\n'));
  }

  if (content.encouragement) {
    parts.push(content.encouragement);
  }

  return parts.join('\n\n').trim();
}

export function deriveCoachConfidence(
  explicit: unknown,
  scanCount?: number | null,
): CoachConfidence | null {
  if (isCoachConfidence(explicit)) {
    return explicit;
  }

  if (typeof scanCount !== 'number' || !Number.isFinite(scanCount)) {
    return null;
  }

  if (scanCount <= 0) {
    return null;
  }

  if (scanCount === 1) {
    return 'low';
  }

  if (scanCount === 2) {
    return 'medium';
  }

  return 'high';
}

export function parseCoachStructuredContent(
  raw: unknown,
  options: ParseCoachContentOptions = {},
): ParsedCoachContentResult {
  const warnings: string[] = [];

  if (!isPlainRecord(raw)) {
    return {
      content: null,
      version: 1,
      synthesizedBody: '',
      warnings,
    };
  }

  const rawTitle = clampString(raw.title, COACH_CONTENT_LIMITS.title);
  const summary = clampString(raw.summary, COACH_CONTENT_LIMITS.summary);

  const resolvedTitle = rawTitle || clampString(options.fallbackTitle, COACH_CONTENT_LIMITS.title);

  if (!resolvedTitle) {
    warnings.push('missing_title');
  }

  if (!summary) {
    warnings.push('missing_summary');
  }

  const contextNotes = clampStringArray(
    raw.context_notes,
    COACH_CONTENT_LIMITS.contextNotesMax,
    COACH_CONTENT_LIMITS.contextNote,
  );
  const priorities = clampStringArray(
    raw.priorities,
    COACH_CONTENT_LIMITS.prioritiesMax,
    COACH_CONTENT_LIMITS.priority,
  );
  const actionSteps = clampStringArray(
    raw.action_steps,
    COACH_CONTENT_LIMITS.actionStepsMax,
    COACH_CONTENT_LIMITS.actionStep,
  );
  const warningsList = clampStringArray(
    raw.warnings,
    COACH_CONTENT_LIMITS.warningsMax,
    COACH_CONTENT_LIMITS.warning,
  );
  const encouragement = clampOptionalString(
    raw.encouragement,
    COACH_CONTENT_LIMITS.encouragement,
  );
  const dataGaps = clampStringArray(
    raw.data_gaps,
    COACH_CONTENT_LIMITS.dataGapsMax,
    COACH_CONTENT_LIMITS.dataGap,
  );
  const primaryMetricDelta = parsePrimaryMetricDelta(raw.primary_metric_delta);
  const confidence = isCoachConfidence(raw.confidence) ? raw.confidence : null;
  const profileUpdates = parseProfileUpdates(raw.profile_updates);

  const hasMinimumContent =
    !!resolvedTitle &&
    (summary.length > 0 ||
      contextNotes.length > 0 ||
      priorities.length > 0 ||
      actionSteps.length > 0 ||
      warningsList.length > 0);

  if (!hasMinimumContent) {
    return {
      content: null,
      version: 1,
      synthesizedBody: '',
      warnings,
    };
  }

  const content: CoachStructuredContent = {
    title: resolvedTitle,
    summary,
    context_notes: contextNotes,
    priorities,
    action_steps: actionSteps,
    warnings: warningsList,
    encouragement,
    primary_metric_delta: primaryMetricDelta,
    data_gaps: dataGaps,
    confidence,
    profile_updates: profileUpdates,
  };

  return {
    content,
    version: 2,
    synthesizedBody: synthesizeCoachBody(content),
    warnings,
  };
}

export function parseCoachResponseVersion(
  value: unknown,
): CoachResponseVersion {
  if (isCoachResponseVersion(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (isCoachResponseVersion(parsed)) {
      return parsed;
    }
  }

  return 1;
}
