import {
  COACH_CONTENT_LIMITS,
  CoachConfidence,
  CoachDailySchedule,
  CoachHabitTracker,
  CoachKnowledgeCard,
  CoachMealSwap,
  CoachMealTemplate,
  CoachMicroRoutine,
  CoachNextScanSuggestion,
  CoachPrimaryMetricDelta,
  CoachProfileUpdateStructured,
  CoachQuickRecipe,
  CoachReminder,
  CoachResponseVersion,
  CoachSignalWatch,
  CoachShoppingListItem,
  CoachStructuredContent,
  CoachStreakCelebration,
  isCoachConfidence,
  isCoachMetricDirection,
  isCoachMetricInterpretation,
  isCoachMetricMagnitude,
  isCoachNextScanType,
  isCoachProfileUpdateFocus,
  isCoachReminderRecurrence,
  isCoachResponseVersion,
  isCoachShoppingSection,
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

function clampInt(value: unknown, min: number, max: number): number | null {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const roundedValue = Math.round(numericValue);
  if (roundedValue < min) {
    return min;
  }

  if (roundedValue > max) {
    return max;
  }

  return roundedValue;
}

const COACH_BODY_LOCALES = ['fr', 'en', 'de', 'it', 'es', 'pt'] as const;

type CoachBodyLocale = (typeof COACH_BODY_LOCALES)[number];

type CoachBodyDayAlias = {
  label: string;
  match: string;
};

type DerivedCoachBodyContent = Pick<
  CoachStructuredContent,
  'summary' | 'action_steps' | 'daily_schedule' | 'micro_routine' | 'encouragement'
>;

const COACH_BODY_DAY_ALIASES: Record<CoachBodyLocale, CoachBodyDayAlias[]> = {
  fr: [
    { label: 'Lundi', match: 'lundi' },
    { label: 'Mardi', match: 'mardi' },
    { label: 'Mercredi', match: 'mercredi' },
    { label: 'Jeudi', match: 'jeudi' },
    { label: 'Vendredi', match: 'vendredi' },
    { label: 'Samedi', match: 'samedi' },
    { label: 'Dimanche', match: 'dimanche' },
  ],
  en: [
    { label: 'Monday', match: 'monday' },
    { label: 'Tuesday', match: 'tuesday' },
    { label: 'Wednesday', match: 'wednesday' },
    { label: 'Thursday', match: 'thursday' },
    { label: 'Friday', match: 'friday' },
    { label: 'Saturday', match: 'saturday' },
    { label: 'Sunday', match: 'sunday' },
  ],
  de: [
    { label: 'Montag', match: 'montag' },
    { label: 'Dienstag', match: 'dienstag' },
    { label: 'Mittwoch', match: 'mittwoch' },
    { label: 'Donnerstag', match: 'donnerstag' },
    { label: 'Freitag', match: 'freitag' },
    { label: 'Samstag', match: 'samstag' },
    { label: 'Sonntag', match: 'sonntag' },
  ],
  it: [
    { label: 'Luned\u00ec', match: 'lunedi' },
    { label: 'Marted\u00ec', match: 'martedi' },
    { label: 'Mercoled\u00ec', match: 'mercoledi' },
    { label: 'Gioved\u00ec', match: 'giovedi' },
    { label: 'Venerd\u00ec', match: 'venerdi' },
    { label: 'Sabato', match: 'sabato' },
    { label: 'Domenica', match: 'domenica' },
  ],
  es: [
    { label: 'Lunes', match: 'lunes' },
    { label: 'Martes', match: 'martes' },
    { label: 'Mi\u00e9rcoles', match: 'miercoles' },
    { label: 'Jueves', match: 'jueves' },
    { label: 'Viernes', match: 'viernes' },
    { label: 'S\u00e1bado', match: 'sabado' },
    { label: 'Domingo', match: 'domingo' },
  ],
  pt: [
    { label: 'Segunda-feira', match: 'segunda-feira' },
    { label: 'Segunda-feira', match: 'segunda feira' },
    { label: 'Ter\u00e7a-feira', match: 'terca-feira' },
    { label: 'Ter\u00e7a-feira', match: 'terca feira' },
    { label: 'Quarta-feira', match: 'quarta-feira' },
    { label: 'Quarta-feira', match: 'quarta feira' },
    { label: 'Quinta-feira', match: 'quinta-feira' },
    { label: 'Quinta-feira', match: 'quinta feira' },
    { label: 'Sexta-feira', match: 'sexta-feira' },
    { label: 'Sexta-feira', match: 'sexta feira' },
    { label: 'S\u00e1bado', match: 'sabado' },
    { label: 'Domingo', match: 'domingo' },
  ],
};

const COACH_BODY_AGENDA_HEADINGS: Record<CoachBodyLocale, string[]> = {
  fr: ['agenda de la semaine', 'agenda'],
  en: ['weekly schedule', 'week schedule', 'agenda'],
  de: ['wochenplan', 'wochenagenda', 'agenda'],
  it: ['agenda della settimana', 'programma della settimana', 'agenda'],
  es: ['agenda de la semana', 'plan de la semana', 'agenda'],
  pt: ['agenda da semana', 'plano da semana', 'agenda'],
};

const COACH_BODY_ROUTINE_HEADINGS: Record<CoachBodyLocale, string[]> = {
  fr: ['routine'],
  en: ['routine'],
  de: ['routine'],
  it: ['routine'],
  es: ['rutina', 'routine'],
  pt: ['rotina', 'routine'],
};

const COACH_BODY_ROUTINE_STOP_HEADINGS: Record<CoachBodyLocale, string[]> = {
  fr: [
    'habitudes a tenir',
    'rappels',
    'prochain scan',
    'signaux a surveiller',
    'vigilance',
    'a savoir',
    'prochain repas',
    'echanges malins',
    'liste de courses',
    'recette flash',
  ],
  en: [
    'habits to track',
    'habit tracker',
    'reminders',
    'next scan',
    'signals to watch',
    'warnings',
    'watch out',
    'knowledge card',
    'next meal',
    'smart swaps',
    'shopping list',
    'quick recipe',
  ],
  de: [
    'gewohnheiten',
    'habit tracker',
    'erinnerungen',
    'nachster scan',
    'signale beobachten',
    'warnungen',
    'wissen',
    'nachste mahlzeit',
    'einkaufsliste',
    'schnelles rezept',
  ],
  it: [
    'abitudini',
    'habit tracker',
    'promemoria',
    'prossimo scan',
    'segnali da osservare',
    'avvisi',
    'da sapere',
    'prossimo pasto',
    'lista della spesa',
    'ricetta veloce',
  ],
  es: [
    'habitos',
    'habit tracker',
    'recordatorios',
    'proximo escaneo',
    'senales a vigilar',
    'advertencias',
    'para saber',
    'proxima comida',
    'lista de compras',
    'receta rapida',
  ],
  pt: [
    'habitos',
    'habit tracker',
    'lembretes',
    'proximo scan',
    'sinais a observar',
    'avisos',
    'a saber',
    'proxima refeicao',
    'lista de compras',
    'receita rapida',
  ],
};

const COACH_BODY_TIME_TOKEN = /\b\d{1,2}(?::\d{2}|h\d{2})\b/i;
const COACH_BODY_SLOT_REGEX = /(\d{1,2}(?::\d{2}|h\d{2}))\s*[—-]\s*/gi;
const COACH_BODY_CHECKMARK_REGEX = /[\u2713\u2714]\s*/g;
const COACH_BODY_NUMBERED_STEP_REGEX = /\b\d+[.)]\s*(.+?)(?=(?:\s+\d+[.)]\s)|$)/gis;

function normalizeCoachBodyLocale(locale?: string | null): CoachBodyLocale {
  const normalized = (locale ?? '').trim().toLowerCase();
  const resolved = COACH_BODY_LOCALES.find((code) => normalized.startsWith(code));
  return resolved ?? 'fr';
}

function normalizeCoachBodyMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getCoachBodyLocaleOrder(locale: CoachBodyLocale): CoachBodyLocale[] {
  return [locale, ...COACH_BODY_LOCALES.filter((entry) => entry !== locale)];
}

function normalizeCoachBodyText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function hasTimeToken(value: string): boolean {
  return COACH_BODY_TIME_TOKEN.test(value);
}

function parseDurationMinutes(value: string): number | null {
  const match = value.match(/\b(\d{1,3})\s*min\b/i);
  return clampInt(match?.[1] ?? null, 1, 180);
}

function buildHeadingAlternatives(
  source: Record<CoachBodyLocale, string[]>,
  locale: CoachBodyLocale,
): string[] {
  return getCoachBodyLocaleOrder(locale).flatMap((entry) => source[entry]);
}

function hasLocalizedHeading(
  value: string,
  headings: string[],
): boolean {
  const normalized = normalizeCoachBodyMatchText(value);
  return headings.some((heading) => normalized.includes(heading));
}

function findFirstSectionHeadingIndex(value: string, headings: string[]): number {
  const normalized = normalizeCoachBodyMatchText(value);
  const candidates: number[] = [];

  for (const heading of headings) {
    const normalizedHeading = normalizeCoachBodyMatchText(heading);
    if (!normalizedHeading) {
      continue;
    }

    let index = normalized.indexOf(normalizedHeading);
    while (index >= 0) {
      const before = normalized[index - 1] ?? '';
      const remainder = normalized.slice(index + normalizedHeading.length);
      const after = remainder.trimStart()[0] ?? '';
      const startsOnBoundary = !before || /\s/.test(before);
      const endsLikeHeading = !after || /[:;—-]/.test(after);

      if (startsOnBoundary && endsLikeHeading) {
        candidates.push(index);
        break;
      }

      index = normalized.indexOf(normalizedHeading, index + 1);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : -1;
}

function matchScheduleDayLine(
  value: string,
  locale: CoachBodyLocale,
): { day: string; remainder: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeCoachBodyMatchText(trimmed);

  for (const localeKey of getCoachBodyLocaleOrder(locale)) {
    for (const alias of COACH_BODY_DAY_ALIASES[localeKey]) {
      if (!normalized.startsWith(alias.match)) {
        continue;
      }

      const boundary = normalized.slice(alias.match.length, alias.match.length + 1);
      if (boundary && /\S/.test(boundary)) {
        continue;
      }

      const remainder = trimmed.slice(alias.match.length).trimStart();
      if (!hasTimeToken(remainder)) {
        continue;
      }

      return {
        day: alias.label,
        remainder,
      };
    }
  }

  return null;
}

function findFirstMarkerIndex(
  bodyText: string,
  locale: CoachBodyLocale,
): number {
  const headings = [
    ...buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale),
    ...buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale),
  ];

  const candidates: number[] = [];
  const checkmarkIndex = bodyText.search(/[\u2713\u2714]/);
  if (checkmarkIndex >= 0) {
    candidates.push(checkmarkIndex);
  }

  const normalizedBody = normalizeCoachBodyMatchText(bodyText);
  for (const heading of headings) {
    const index = normalizedBody.indexOf(heading);
    if (index >= 0) {
      candidates.push(index);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : -1;
}

function splitBodyIntoParagraphs(bodyText: string): string[] {
  return normalizeCoachBodyText(bodyText)
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPrefixedListLine(line: string): boolean {
  return /^(?:\u2022|\u2192|\u2713|\u26a0|-)\s+/.test(line.trim());
}

function paragraphHasOnlyPrefixedLines(paragraph: string): boolean {
  const lines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && lines.every((line) => isPrefixedListLine(line));
}

function extractSummaryFromBodyText(
  bodyText: string,
  locale: CoachBodyLocale,
): string {
  const normalizedBody = normalizeCoachBodyText(bodyText);
  if (!normalizedBody) {
    return '';
  }

  const firstMarkerIndex = findFirstMarkerIndex(normalizedBody, locale);
  const boundaryCandidate =
    firstMarkerIndex > 0 ? normalizedBody.slice(0, firstMarkerIndex).trim() : '';

  if (boundaryCandidate) {
    return clampString(boundaryCandidate, COACH_CONTENT_LIMITS.summary);
  }

  const paragraphs = splitBodyIntoParagraphs(normalizedBody);
  const preferred = paragraphs.find((paragraph) => !paragraphHasOnlyPrefixedLines(paragraph));
  return clampString(preferred ?? paragraphs[0] ?? normalizedBody, COACH_CONTENT_LIMITS.summary);
}

function stripCoachBodyTailAtHeading(
  value: string,
  locale: CoachBodyLocale,
): string {
  const lines = normalizeCoachBodyText(value).split(/\n/);
  const agendaHeadings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale);
  const routineHeadings = buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale);
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length > 0) {
        break;
      }
      continue;
    }

    const normalized = normalizeCoachBodyMatchText(trimmed);
    const headingIndex = [...agendaHeadings, ...routineHeadings]
      .map((heading) => normalized.indexOf(heading))
      .filter((candidate) => candidate >= 0)
      .sort((left, right) => left - right)[0];

    if (matchScheduleDayLine(trimmed, locale)) {
      break;
    }

    if ((headingIndex ?? -1) >= 0) {
      const beforeHeading = trimmed.slice(0, headingIndex).trim();
      if (beforeHeading) {
        kept.push(beforeHeading);
      }
      break;
    }

    kept.push(trimmed);
  }

  return kept.join(' ').trim();
}

function deriveActionStepsFromBody(
  bodyText: string,
  locale: CoachBodyLocale,
): string[] {
  const normalizedBody = normalizeCoachBodyText(bodyText);
  if (!normalizedBody) {
    return [];
  }

  COACH_BODY_CHECKMARK_REGEX.lastIndex = 0;
  const matches = Array.from(normalizedBody.matchAll(COACH_BODY_CHECKMARK_REGEX));
  if (matches.length === 0) {
    return [];
  }

  const steps: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    if (steps.length >= COACH_CONTENT_LIMITS.actionStepsMax) {
      break;
    }

    const current = matches[index];
    const start = (current.index ?? 0) + current[0].length;
    const end = matches[index + 1]?.index ?? normalizedBody.length;
    const rawStep = stripCoachBodyTailAtHeading(normalizedBody.slice(start, end), locale);
    const cleaned = clampString(
      rawStep.replace(/\s+/g, ' ').trim(),
      COACH_CONTENT_LIMITS.actionStep,
    );

    if (cleaned) {
      steps.push(cleaned);
    }
  }

  return steps;
}

function stripAgendaHeadingPrefix(
  value: string,
  locale: CoachBodyLocale,
): string {
  const trimmed = value.trim();
  const normalized = normalizeCoachBodyMatchText(trimmed);
  const headings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale).sort(
    (left, right) => right.length - left.length,
  );

  for (const heading of headings) {
    if (!normalized.startsWith(heading)) {
      continue;
    }

    return trimmed
      .slice(heading.length)
      .replace(/^[\s:—-]+/, '')
      .trim();
  }

  return trimmed;
}

function deriveDailyScheduleFromBody(
  bodyText: string,
  locale: CoachBodyLocale,
): CoachDailySchedule[] {
  const normalizedBody = normalizeCoachBodyText(bodyText);
  if (!normalizedBody) {
    return [];
  }

  const bodyLines = normalizedBody.split(/\n+/);
  const scheduleLines: string[] = [];
  const agendaHeadings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale);

  bodyLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (hasLocalizedHeading(trimmed, agendaHeadings)) {
      const remainder = stripAgendaHeadingPrefix(trimmed, locale);
      if (remainder) {
        scheduleLines.push(remainder);
      }
      return;
    }

    scheduleLines.push(trimmed);
  });

  const dayBlocks: Array<{ day: string; text: string }> = [];
  let currentBlock: { day: string; text: string } | null = null;

  scheduleLines.forEach((line) => {
    const dayMatch = matchScheduleDayLine(line, locale);
    if (dayMatch) {
      if (currentBlock && dayBlocks.length < COACH_CONTENT_LIMITS.dailyScheduleMax) {
        dayBlocks.push(currentBlock);
      }
      currentBlock = {
        day: dayMatch.day,
        text: dayMatch.remainder,
      };
      return;
    }

    if (currentBlock) {
      currentBlock.text = `${currentBlock.text} ${line}`.trim();
    }
  });

  if (currentBlock && dayBlocks.length < COACH_CONTENT_LIMITS.dailyScheduleMax) {
    dayBlocks.push(currentBlock);
  }

  const days: CoachDailySchedule[] = [];
  for (const block of dayBlocks) {
    if (days.length >= COACH_CONTENT_LIMITS.dailyScheduleMax) {
      break;
    }

    const slots: CoachDailySchedule['slots'] = [];
    COACH_BODY_SLOT_REGEX.lastIndex = 0;
    const slotMatches = Array.from(block.text.matchAll(COACH_BODY_SLOT_REGEX));
    for (let index = 0; index < slotMatches.length; index += 1) {
      if (slots.length >= COACH_CONTENT_LIMITS.scheduleSlotsMax) {
        break;
      }

      const current = slotMatches[index];
      const start = (current.index ?? 0) + current[0].length;
      const end = slotMatches[index + 1]?.index ?? block.text.length;
      const actionText = clampString(
        block.text
          .slice(start, end)
          .replace(/\s+/g, ' ')
          .trim(),
        COACH_CONTENT_LIMITS.scheduleAction,
      );
      const time = clampString(current[1], COACH_CONTENT_LIMITS.scheduleTime);
      if (!time || !actionText) {
        continue;
      }

      slots.push({
        time,
        duration_min: parseDurationMinutes(actionText),
        action: actionText,
        tag: null,
      });
    }

    if (slots.length > 0) {
      days.push({
        day: clampString(block.day, COACH_CONTENT_LIMITS.scheduleDay),
        slots,
      });
    }
  }

  return days;
}

function buildRoutineHeaderPattern(locale: CoachBodyLocale): string {
  return buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale)
    .sort((left, right) => right.length - left.length)
    .map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

function deriveMicroRoutineFromBody(
  bodyText: string,
  locale: CoachBodyLocale,
): CoachMicroRoutine[] {
  const normalizedBody = normalizeCoachBodyText(bodyText);
  if (!normalizedBody) {
    return [];
  }

  const headerPattern = buildRoutineHeaderPattern(locale);
  if (!headerPattern) {
    return [];
  }

  const routineHeaderRegex = new RegExp(
    `(?:^|\\n|\\s)(?:${headerPattern})\\s*[—:-]\\s*`,
    'gi',
  );
  const headerMatches = Array.from(normalizedBody.matchAll(routineHeaderRegex));
  if (headerMatches.length === 0) {
    return [];
  }

  const routineStopHeadings = [
    ...buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale),
    ...buildHeadingAlternatives(COACH_BODY_ROUTINE_STOP_HEADINGS, locale),
  ];
  const routines: CoachMicroRoutine[] = [];

  for (let index = 0; index < headerMatches.length; index += 1) {
    if (routines.length >= COACH_CONTENT_LIMITS.microRoutineMax) {
      break;
    }

    const match = headerMatches[index];
    const blockStart = (match.index ?? 0) + match[0].length;
    let blockEnd = headerMatches[index + 1]?.index ?? normalizedBody.length;
    const rawBlock = normalizedBody.slice(blockStart, blockEnd).trim();
    if (!rawBlock) {
      continue;
    }

    const stopIndex = findFirstSectionHeadingIndex(rawBlock, routineStopHeadings);
    const block = stopIndex >= 0 ? rawBlock.slice(0, stopIndex).trim() : rawBlock;
    COACH_BODY_NUMBERED_STEP_REGEX.lastIndex = 0;
    const stepMatches = Array.from(block.matchAll(COACH_BODY_NUMBERED_STEP_REGEX));
    if (stepMatches.length === 0) {
      continue;
    }

    const headerText = block.slice(0, stepMatches[0]?.index ?? 0).trim();
    const headerMatch = headerText.match(
      /^(.*?)(?:\s*\(([^)]+)\))?(?:\s*[·•-]\s*(\d{1,2})\s*min)?\s*$/i,
    );
    const name = clampString(
      headerMatch?.[1] ?? headerText,
      COACH_CONTENT_LIMITS.routineName,
    );
    if (!name) {
      continue;
    }

    const steps = stepMatches
      .map((stepMatch) =>
        clampString(
          stepMatch[1].replace(/\s+/g, ' ').trim(),
          COACH_CONTENT_LIMITS.routineStep,
        ),
      )
      .filter((step): step is string => step.length > 0)
      .slice(0, COACH_CONTENT_LIMITS.routineStepsMax);
    if (steps.length === 0) {
      continue;
    }

    routines.push({
      name,
      when: clampOptionalString(
        headerMatch?.[2] ?? null,
        COACH_CONTENT_LIMITS.routineWhen,
      ),
      total_min: clampInt(headerMatch?.[3] ?? null, 1, 60),
      steps,
    });
  }

  return routines;
}

function deriveEncouragementFromBody(
  bodyText: string,
  locale: CoachBodyLocale,
  summary: string,
): string | null {
  const paragraphs = splitBodyIntoParagraphs(bodyText);
  const lastParagraph = paragraphs[paragraphs.length - 1] ?? '';
  if (!lastParagraph || lastParagraph === summary || paragraphHasOnlyPrefixedLines(lastParagraph)) {
    return null;
  }

  const normalized = normalizeCoachBodyMatchText(lastParagraph);
  if (
    hasLocalizedHeading(lastParagraph, buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale)) ||
    hasLocalizedHeading(lastParagraph, buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale)) ||
    matchScheduleDayLine(lastParagraph, locale) ||
    hasTimeToken(normalized)
  ) {
    return null;
  }

  return clampOptionalString(lastParagraph, COACH_CONTENT_LIMITS.encouragement);
}

export function deriveCoachStructuredContentFromBody(
  body: unknown,
  options: { locale?: string | null } = {},
): DerivedCoachBodyContent | null {
  if (typeof body !== 'string' || !body.trim()) {
    return null;
  }

  const locale = normalizeCoachBodyLocale(options.locale);
  const summary = extractSummaryFromBodyText(body, locale);
  const actionSteps = deriveActionStepsFromBody(body, locale);
  const dailySchedule = deriveDailyScheduleFromBody(body, locale);
  const microRoutine = deriveMicroRoutineFromBody(body, locale);
  const encouragement = deriveEncouragementFromBody(body, locale, summary);

  if (
    !summary &&
    actionSteps.length === 0 &&
    dailySchedule.length === 0 &&
    microRoutine.length === 0 &&
    !encouragement
  ) {
    return null;
  }

  return {
    summary,
    action_steps: actionSteps,
    daily_schedule: dailySchedule,
    micro_routine: microRoutine,
    encouragement,
  };
}

export function mergeCoachStructuredContentWithBodyFallback(
  content: CoachStructuredContent | null | undefined,
  body: unknown,
  options: { fallbackTitle?: string | null; locale?: string | null } = {},
): CoachStructuredContent | null {
  const derived = deriveCoachStructuredContentFromBody(body, {
    locale: options.locale,
  });

  if (!derived) {
    return content ?? null;
  }

  const derivedDailySchedule = derived.daily_schedule ?? [];
  const derivedMicroRoutine = derived.micro_routine ?? [];

  if (content) {
    const contentDailySchedule = content.daily_schedule ?? [];
    const contentMicroRoutine = content.micro_routine ?? [];

    return {
      ...content,
      summary: content.summary || derived.summary,
      action_steps:
        content.action_steps.length > 0
          ? content.action_steps
          : derived.action_steps,
      encouragement: content.encouragement ?? derived.encouragement,
      daily_schedule:
        contentDailySchedule.length > 0
          ? contentDailySchedule
          : derivedDailySchedule,
      micro_routine:
        contentMicroRoutine.length > 0
          ? contentMicroRoutine
          : derivedMicroRoutine,
    };
  }

  const fallbackTitle = clampString(options.fallbackTitle, COACH_CONTENT_LIMITS.title);
  const hasStructuredDetails =
    derived.action_steps.length > 0 ||
    derivedDailySchedule.length > 0 ||
    derivedMicroRoutine.length > 0;

  if (!fallbackTitle || !hasStructuredDetails) {
    return null;
  }

  return {
    title: fallbackTitle,
    summary: derived.summary,
    context_notes: [],
    priorities: [],
    action_steps: derived.action_steps,
    warnings: [],
    encouragement: derived.encouragement,
    primary_metric_delta: null,
    data_gaps: [],
    confidence: null,
    daily_schedule: derivedDailySchedule,
    micro_routine: derivedMicroRoutine,
    meal_template: null,
    meal_swaps: [],
    shopping_list: [],
    quick_recipe: null,
    knowledge_card: null,
    habit_tracker: [],
    reminders: [],
    next_scan_suggestion: null,
    signal_watch: [],
    streak_celebration: null,
    profile_updates: null,
  };
}

function parseDailySchedule(value: unknown): CoachDailySchedule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const days: CoachDailySchedule[] = [];
  for (const entry of value) {
    if (days.length >= COACH_CONTENT_LIMITS.dailyScheduleMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const day = clampString(entry.day, COACH_CONTENT_LIMITS.scheduleDay);
    if (!day) {
      continue;
    }

    const slots: CoachDailySchedule['slots'] = [];
    if (Array.isArray(entry.slots)) {
      for (const slot of entry.slots) {
        if (slots.length >= COACH_CONTENT_LIMITS.scheduleSlotsMax) {
          break;
        }

        if (!isPlainRecord(slot)) {
          continue;
        }

        const time = clampString(slot.time, COACH_CONTENT_LIMITS.scheduleTime);
        const action = clampString(
          slot.action,
          COACH_CONTENT_LIMITS.scheduleAction,
        );
        if (!time || !action) {
          continue;
        }

        slots.push({
          time,
          duration_min: clampInt(slot.duration_min, 1, 180),
          action,
          tag: clampOptionalString(slot.tag, COACH_CONTENT_LIMITS.scheduleTag),
        });
      }
    }

    if (slots.length > 0) {
      days.push({ day, slots });
    }
  }

  return days;
}

function parseSingleMicroRoutine(value: unknown): CoachMicroRoutine | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const name = clampString(value.name, COACH_CONTENT_LIMITS.routineName);
  if (!name) {
    return null;
  }

  const steps = clampStringArray(
    value.steps,
    COACH_CONTENT_LIMITS.routineStepsMax,
    COACH_CONTENT_LIMITS.routineStep,
  );
  if (steps.length === 0) {
    return null;
  }

  return {
    name,
    when: clampOptionalString(value.when, COACH_CONTENT_LIMITS.routineWhen),
    total_min: clampInt(value.total_min, 1, 60),
    steps,
  };
}

function parseMicroRoutine(value: unknown): CoachMicroRoutine[] {
  const source = Array.isArray(value) ? value : [value];
  const routines: CoachMicroRoutine[] = [];

  for (const entry of source) {
    if (routines.length >= COACH_CONTENT_LIMITS.microRoutineMax) {
      break;
    }

    const routine = parseSingleMicroRoutine(entry);
    if (routine) {
      routines.push(routine);
    }
  }

  return routines;
}

function parseMealTemplate(value: unknown): CoachMealTemplate | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const name = clampString(value.name, COACH_CONTENT_LIMITS.mealName);
  if (!name) {
    return null;
  }

  const ingredients: CoachMealTemplate['ingredients'] = [];
  if (Array.isArray(value.ingredients)) {
    for (const ingredient of value.ingredients) {
      if (ingredients.length >= COACH_CONTENT_LIMITS.mealIngredientsMax) {
        break;
      }

      if (!isPlainRecord(ingredient)) {
        continue;
      }

      const item = clampString(
        ingredient.item,
        COACH_CONTENT_LIMITS.mealIngredientItem,
      );
      if (!item) {
        continue;
      }

      ingredients.push({
        item,
        portion: clampOptionalString(
          ingredient.portion,
          COACH_CONTENT_LIMITS.mealIngredientPortion,
        ),
      });
    }
  }

  if (ingredients.length === 0) {
    return null;
  }

  return {
    name,
    when: clampOptionalString(value.when, COACH_CONTENT_LIMITS.mealWhen),
    prep_min: clampInt(value.prep_min, 1, 60),
    ingredients,
    why: clampOptionalString(value.why, COACH_CONTENT_LIMITS.mealWhy),
  };
}

function parseMealSwaps(value: unknown): CoachMealSwap[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const swaps: CoachMealSwap[] = [];
  for (const entry of value) {
    if (swaps.length >= COACH_CONTENT_LIMITS.mealSwapsMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const from = clampString(entry.from, COACH_CONTENT_LIMITS.mealSwapFrom);
    const to = clampString(entry.to, COACH_CONTENT_LIMITS.mealSwapTo);
    if (!from || !to) {
      continue;
    }

    swaps.push({
      from,
      to,
      why: clampOptionalString(entry.why, COACH_CONTENT_LIMITS.mealSwapWhy),
    });
  }

  return swaps;
}

function normalizeShoppingSection(value: unknown) {
  const rawSection = clampString(
    value,
    COACH_CONTENT_LIMITS.shoppingSection,
  ).toLowerCase();
  const aliases: Record<string, CoachShoppingListItem['section']> = {
    fresh: 'frais',
    frais: 'frais',
    dry: 'sec',
    sec: 'sec',
    drinks: 'boissons',
    boissons: 'boissons',
    snack: 'snacks',
    snacks: 'snacks',
    other: 'autre',
    autre: 'autre',
  };
  const normalized = aliases[rawSection] ?? rawSection;
  return isCoachShoppingSection(normalized) ? normalized : 'autre';
}

function parseShoppingList(value: unknown): CoachShoppingListItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: CoachShoppingListItem[] = [];
  for (const entry of value) {
    if (items.length >= COACH_CONTENT_LIMITS.shoppingListMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const item = clampString(entry.item, COACH_CONTENT_LIMITS.shoppingItem);
    if (!item) {
      continue;
    }

    items.push({
      item,
      section: normalizeShoppingSection(entry.section),
    });
  }

  return items;
}

function parseQuickRecipe(value: unknown): CoachQuickRecipe | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const name = clampString(value.name, COACH_CONTENT_LIMITS.recipeName);
  if (!name) {
    return null;
  }

  const steps = clampStringArray(
    value.steps,
    COACH_CONTENT_LIMITS.recipeStepsMax,
    COACH_CONTENT_LIMITS.recipeStep,
  );
  if (steps.length === 0) {
    return null;
  }

  return {
    name,
    total_min: clampInt(value.total_min, 1, 15),
    steps,
    tags: clampStringArray(
      value.tags,
      COACH_CONTENT_LIMITS.recipeTagsMax,
      COACH_CONTENT_LIMITS.recipeTag,
    ),
  };
}

function parseKnowledgeCard(value: unknown): CoachKnowledgeCard | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const title = clampString(value.title, COACH_CONTENT_LIMITS.knowledgeTitle);
  const body = clampString(value.body, COACH_CONTENT_LIMITS.knowledgeBody);
  if (!title || !body) {
    return null;
  }

  return {
    title,
    body,
    takeaway: clampOptionalString(
      value.takeaway,
      COACH_CONTENT_LIMITS.knowledgeTakeaway,
    ),
  };
}

function parseHabitTracker(value: unknown): CoachHabitTracker[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const habits: CoachHabitTracker[] = [];
  for (const entry of value) {
    if (habits.length >= COACH_CONTENT_LIMITS.habitTrackerMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const label = clampString(entry.label, COACH_CONTENT_LIMITS.habitLabel);
    const targetDays = clampInt(entry.target_days, 1, 7);
    if (!label || targetDays === null) {
      continue;
    }

    habits.push({
      label,
      target_days: targetDays,
      window: clampOptionalString(
        entry.window,
        COACH_CONTENT_LIMITS.habitWindow,
      ),
    });
  }

  return habits;
}

function parseReminders(value: unknown): CoachReminder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reminders: CoachReminder[] = [];
  for (const entry of value) {
    if (reminders.length >= COACH_CONTENT_LIMITS.remindersMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const at = clampString(entry.at, COACH_CONTENT_LIMITS.reminderAt);
    const label = clampString(entry.label, COACH_CONTENT_LIMITS.reminderLabel);
    if (!at || !label) {
      continue;
    }

    const recurrence = clampString(
      entry.recurrence,
      COACH_CONTENT_LIMITS.reminderRecurrence,
    ).toLowerCase();

    reminders.push({
      at,
      label,
      recurrence: isCoachReminderRecurrence(recurrence)
        ? recurrence
        : 'today',
    });
  }

  return reminders;
}

function parseNextScanSuggestion(
  value: unknown,
): CoachNextScanSuggestion | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const scanType = clampString(
    value.scan_type,
    COACH_CONTENT_LIMITS.nextScanType,
  ).toLowerCase();
  const inDays = clampInt(value.in_days, 0, 30);

  if (!isCoachNextScanType(scanType) || inDays === null) {
    return null;
  }

  return {
    scan_type: scanType,
    in_days: inDays,
    reason: clampOptionalString(
      value.reason,
      COACH_CONTENT_LIMITS.nextScanReason,
    ),
  };
}

function parseSignalWatch(value: unknown): CoachSignalWatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const signals: CoachSignalWatch[] = [];
  for (const entry of value) {
    if (signals.length >= COACH_CONTENT_LIMITS.signalWatchMax) {
      break;
    }

    if (!isPlainRecord(entry)) {
      continue;
    }

    const signal = clampString(entry.signal, COACH_CONTENT_LIMITS.signalName);
    const whatToNotice = clampString(
      entry.what_to_notice,
      COACH_CONTENT_LIMITS.signalNotice,
    );
    if (!signal || !whatToNotice) {
      continue;
    }

    signals.push({
      signal,
      what_to_notice: whatToNotice,
      when_to_escalate: clampOptionalString(
        entry.when_to_escalate,
        COACH_CONTENT_LIMITS.signalEscalation,
      ),
    });
  }

  return signals;
}

function parseStreakCelebration(
  value: unknown,
): CoachStreakCelebration | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const days = clampInt(value.days, 1, 365);
  const message = clampString(value.message, COACH_CONTENT_LIMITS.streakMessage);
  if (days === null || !message) {
    return null;
  }

  return { days, message };
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

  if (content.meal_template) {
    const mealMeta = [
      content.meal_template.when,
      content.meal_template.prep_min
        ? `${content.meal_template.prep_min} min`
        : null,
    ].filter(Boolean);
    const mealLines = [
      `Prochain repas — ${content.meal_template.name}${
        mealMeta.length > 0 ? ` (${mealMeta.join(' · ')})` : ''
      }`,
      ...content.meal_template.ingredients.map((ingredient) =>
        ingredient.portion
          ? `• ${ingredient.item} — ${ingredient.portion}`
          : `• ${ingredient.item}`,
      ),
      content.meal_template.why,
    ].filter(Boolean);
    parts.push(mealLines.join('\n'));
  }

  if (content.quick_recipe) {
    const recipeLines = [
      `Recette flash — ${content.quick_recipe.name}${
        content.quick_recipe.total_min
          ? ` (${content.quick_recipe.total_min} min)`
          : ''
      }`,
      ...content.quick_recipe.steps.map((step, index) => `${index + 1}. ${step}`),
    ];
    parts.push(recipeLines.join('\n'));
  }

  if (content.meal_swaps && content.meal_swaps.length > 0) {
    parts.push(
      [
        'Échanges malins',
        ...content.meal_swaps.map((swap) =>
          swap.why
            ? `• ${swap.from} → ${swap.to} (${swap.why})`
            : `• ${swap.from} → ${swap.to}`,
        ),
      ].join('\n'),
    );
  }

  if (content.shopping_list && content.shopping_list.length > 0) {
    parts.push(
      [
        'Liste de courses',
        ...content.shopping_list.map((item) => `• ${item.item}`),
      ].join('\n'),
    );
  }

  if (content.daily_schedule && content.daily_schedule.length > 0) {
    parts.push(
      [
        'Planning',
        ...content.daily_schedule.flatMap((day) => [
          day.day,
          ...day.slots.map((slot) =>
            slot.duration_min
              ? `• ${slot.time} · ${slot.action} (${slot.duration_min} min)`
              : `• ${slot.time} · ${slot.action}`,
          ),
        ]),
      ].join('\n'),
    );
  }

  if (content.micro_routine && content.micro_routine.length > 0) {
    parts.push(
      [
        'Routine courte',
        ...content.micro_routine.flatMap((routine) => [
          routine.total_min
            ? `${routine.name} (${routine.total_min} min)`
            : routine.name,
          ...routine.steps.map((step) => `• ${step}`),
        ]),
      ].join('\n'),
    );
  }

  if (content.habit_tracker && content.habit_tracker.length > 0) {
    parts.push(
      [
        'Habitudes à tenir',
        ...content.habit_tracker.map((habit) =>
          habit.window
            ? `☐ ${habit.label} · ${habit.target_days}j/7 (${habit.window})`
            : `☐ ${habit.label} · ${habit.target_days}j/7`,
        ),
      ].join('\n'),
    );
  }

  if (content.reminders && content.reminders.length > 0) {
    parts.push(
      [
        'Rappels',
        ...content.reminders.map((reminder) => `• ${reminder.at} · ${reminder.label}`),
      ].join('\n'),
    );
  }

  if (content.knowledge_card) {
    parts.push(
      [
        `À savoir — ${content.knowledge_card.title}`,
        content.knowledge_card.body,
        content.knowledge_card.takeaway,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  if (content.next_scan_suggestion) {
    parts.push(
      [
        `Prochain scan — ${content.next_scan_suggestion.scan_type} dans ${content.next_scan_suggestion.in_days}j`,
        content.next_scan_suggestion.reason,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  if (content.signal_watch && content.signal_watch.length > 0) {
    parts.push(
      [
        'Signaux à surveiller',
        ...content.signal_watch.map((signal) =>
          signal.when_to_escalate
            ? `• ${signal.signal}: ${signal.what_to_notice} (${signal.when_to_escalate})`
            : `• ${signal.signal}: ${signal.what_to_notice}`,
        ),
      ].join('\n'),
    );
  }

  if (content.encouragement) {
    parts.push(content.encouragement);
  }

  if (content.streak_celebration) {
    parts.push(content.streak_celebration.message);
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
  const dailySchedule = parseDailySchedule(raw.daily_schedule);
  const microRoutine = parseMicroRoutine(raw.micro_routine);
  const mealTemplate = parseMealTemplate(raw.meal_template);
  const mealSwaps = parseMealSwaps(raw.meal_swaps);
  const shoppingList = parseShoppingList(raw.shopping_list);
  const quickRecipe = parseQuickRecipe(raw.quick_recipe);
  const knowledgeCard = parseKnowledgeCard(raw.knowledge_card);
  const habitTracker = parseHabitTracker(raw.habit_tracker);
  const reminders = parseReminders(raw.reminders);
  const nextScanSuggestion = parseNextScanSuggestion(raw.next_scan_suggestion);
  const signalWatch = parseSignalWatch(raw.signal_watch);
  const streakCelebration = parseStreakCelebration(raw.streak_celebration);
  const profileUpdates = parseProfileUpdates(raw.profile_updates);

  const hasExtendedContent =
    dailySchedule.length > 0 ||
    microRoutine.length > 0 ||
    !!mealTemplate ||
    mealSwaps.length > 0 ||
    shoppingList.length > 0 ||
    !!quickRecipe ||
    !!knowledgeCard ||
    habitTracker.length > 0 ||
    reminders.length > 0 ||
    !!nextScanSuggestion ||
    signalWatch.length > 0 ||
    !!streakCelebration ||
    !!profileUpdates;

  const hasMinimumContent =
    !!resolvedTitle &&
    (summary.length > 0 ||
      contextNotes.length > 0 ||
      priorities.length > 0 ||
      actionSteps.length > 0 ||
      warningsList.length > 0 ||
      dataGaps.length > 0 ||
      hasExtendedContent);

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
    daily_schedule: dailySchedule,
    micro_routine: microRoutine,
    meal_template: mealTemplate,
    meal_swaps: mealSwaps,
    shopping_list: shoppingList,
    quick_recipe: quickRecipe,
    knowledge_card: knowledgeCard,
    habit_tracker: habitTracker,
    reminders,
    next_scan_suggestion: nextScanSuggestion,
    signal_watch: signalWatch,
    streak_celebration: streakCelebration,
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
