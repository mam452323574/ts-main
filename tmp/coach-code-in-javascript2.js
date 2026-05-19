// Final shared coach normalizer.
// All coach prompt branches must converge here so the front-end always receives the same coach v2 contract.
// This node also absorbs markdown/noisy LLM output and replaces missing pieces with localized fallbacks.

function safeNodeItemJson(nodeName) {
  try {
    return $(nodeName).item.json ?? {};
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstNonEmptyString(values) {
  for (const value of values) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function normalizeLanguageCode(value) {
  const lowered = String(value ?? "").trim().toLowerCase();
  if (lowered.startsWith("fr")) return "fr";
  if (lowered.startsWith("en")) return "en";
  if (lowered.startsWith("de")) return "de";
  if (lowered.startsWith("it")) return "it";
  if (lowered.startsWith("es")) return "es";
  if (lowered.startsWith("pt")) return "pt";
  return null;
}

function stripCodeFences(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const fence = String.fromCharCode(96).repeat(3);
  return trimmed
    .replace(new RegExp(fence + "(?:json)?\\s*([\\s\\S]*?)\\s*" + fence, "gi"), "$1")
    .trim();
}

function scanTextForParsedObjects(text) {
  const results = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            results.push(JSON.parse(candidate));
          } catch {}
          break;
        }
      }
    }
  }
  return results;
}

function collectObjectsFromValue(value, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return collectObjectsFromString(value, depth + 1);
  }

  if (Array.isArray(value)) {
    const nested = [];
    for (const entry of value) {
      nested.push(...collectObjectsFromValue(entry, depth + 1));
    }
    return nested;
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const results = [value];
  const wrapperKeys = ["data", "content", "output", "text", "response", "message", "result", "payload"];

  for (const key of wrapperKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      results.push(...collectObjectsFromValue(value[key], depth + 1));
    }
  }

  if (Array.isArray(value.choices)) {
    results.push(...collectObjectsFromValue(value.choices, depth + 1));
  }

  return results;
}

function collectObjectsFromString(value, depth) {
  if (depth > 6) return [];

  const stripped = stripCodeFences(value);
  if (!stripped) return [];

  try {
    const parsed = JSON.parse(stripped);
    const nested = collectObjectsFromValue(parsed, depth + 1);
    if (nested.length > 0) {
      return nested;
    }
  } catch {}

  const extracted = [];
  for (const parsedCandidate of scanTextForParsedObjects(stripped)) {
    extracted.push(...collectObjectsFromValue(parsedCandidate, depth + 1));
  }
  return extracted;
}

function isCoachPayloadLike(value) {
  if (!isPlainObject(value)) return false;
  return !!(
    readText(value.title) ||
    readText(value.body) ||
    Object.prototype.hasOwnProperty.call(value, "response_version") ||
    isPlainObject(value.content)
  );
}

function clampString(value, max) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max).trim();
}

function clampOptionalString(value, max) {
  const clamped = clampString(value, max);
  return clamped || null;
}

function clampArray(value, maxItems, maxChars) {
  if (!Array.isArray(value)) return [];
  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const clamped = clampString(entry, maxChars);
    if (!clamped) continue;
    cleaned.push(clamped);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

function parseMetricDelta(value, allowMetricDelta) {
  if (!allowMetricDelta || !isPlainObject(value)) return null;

  const metric_key = clampString(value.metric_key, 64);
  const human_label = clampString(value.human_label, 120);
  const direction = readText(value.direction);
  const magnitude = readText(value.magnitude);
  const interpretation = readText(value.interpretation);

  if (!metric_key || !human_label) return null;
  if (!["up", "down", "stable"].includes(direction)) return null;
  if (!["slight", "moderate", "strong"].includes(magnitude)) return null;
  if (!["positive", "negative", "neutral"].includes(interpretation)) return null;

  return {
    metric_key,
    human_label,
    direction,
    magnitude,
    interpretation,
  };
}

function clampInt(value, min, max) {
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function parseDailySchedule(value) {
  if (!Array.isArray(value)) return [];
  const days = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const day = clampString(entry.day, 24);
    if (!day) continue;
    const slots = [];
    if (Array.isArray(entry.slots)) {
      for (const slot of entry.slots) {
        if (!isPlainObject(slot)) continue;
        const time = clampString(slot.time, 16);
        const action = clampString(slot.action, 140);
        if (!time || !action) continue;
        const duration_min = clampInt(slot.duration_min, 1, 180);
        const tag = clampOptionalString(slot.tag, 24);
        slots.push({ time, duration_min, action, tag });
        if (slots.length >= 4) break;
      }
    }
    if (slots.length === 0) continue;
    days.push({ day, slots });
    if (days.length >= 7) break;
  }
  return days;
}

function parseSingleRoutine(value) {
  if (!isPlainObject(value)) return null;
  const name = clampString(value.name, 80);
  if (!name) return null;
  const when = clampOptionalString(value.when, 40);
  const steps = [];
  if (Array.isArray(value.steps)) {
    for (const step of value.steps) {
      const clamped = clampString(step, 120);
      if (!clamped) continue;
      steps.push(clamped);
      if (steps.length >= 6) break;
    }
  }
  if (steps.length === 0) return null;
  const total_min = clampInt(value.total_min, 1, 60);
  return { name, when, total_min, steps };
}

function parseMicroRoutine(value) {
  if (Array.isArray(value)) {
    const list = [];
    for (const entry of value) {
      const routine = parseSingleRoutine(entry);
      if (routine) list.push(routine);
      if (list.length >= 2) break;
    }
    return list;
  }
  const single = parseSingleRoutine(value);
  return single ? [single] : [];
}

function parseMealTemplate(value) {
  if (!isPlainObject(value)) return null;
  const name = clampString(value.name, 80);
  if (!name) return null;
  const when = clampOptionalString(value.when, 24);
  const prep_min = clampInt(value.prep_min, 1, 60);
  const why = clampOptionalString(value.why, 200);
  const ingredients = [];
  if (Array.isArray(value.ingredients)) {
    for (const ing of value.ingredients) {
      if (!isPlainObject(ing)) continue;
      const item = clampString(ing.item, 60);
      if (!item) continue;
      const portion = clampOptionalString(ing.portion, 40);
      ingredients.push({ item, portion });
      if (ingredients.length >= 6) break;
    }
  }
  if (ingredients.length === 0) return null;
  return { name, when, prep_min, ingredients, why };
}

function parseMealSwaps(value) {
  if (!Array.isArray(value)) return [];
  const swaps = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const from = clampString(entry.from, 80);
    const to = clampString(entry.to, 80);
    if (!from || !to) continue;
    const why = clampOptionalString(entry.why, 160);
    swaps.push({ from, to, why });
    if (swaps.length >= 3) break;
  }
  return swaps;
}

function parseShoppingList(value) {
  if (!Array.isArray(value)) return [];
  const sectionAliases = { fresh: 'frais', dry: 'sec', drinks: 'boissons', boissons: 'boissons', snack: 'snacks', snacks: 'snacks', frais: 'frais', sec: 'sec', autre: 'autre', other: 'autre' };
  const items = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const item = clampString(entry.item, 60);
    if (!item) continue;
    const rawSection = clampString(entry.section, 20).toLowerCase();
    const section = sectionAliases[rawSection] || 'autre';
    items.push({ item, section });
    if (items.length >= 12) break;
  }
  return items;
}

function parseQuickRecipe(value) {
  if (!isPlainObject(value)) return null;
  const name = clampString(value.name, 80);
  if (!name) return null;
  const total_min = clampInt(value.total_min, 1, 15);
  const steps = [];
  if (Array.isArray(value.steps)) {
    for (const step of value.steps) {
      const clamped = clampString(step, 120);
      if (!clamped) continue;
      steps.push(clamped);
      if (steps.length >= 5) break;
    }
  }
  if (steps.length === 0) return null;
  const tags = [];
  if (Array.isArray(value.tags)) {
    for (const tag of value.tags) {
      const clamped = clampString(tag, 24);
      if (!clamped) continue;
      tags.push(clamped);
      if (tags.length >= 4) break;
    }
  }
  return { name, total_min, steps, tags };
}

function parseKnowledgeCard(value) {
  if (!isPlainObject(value)) return null;
  const title = clampString(value.title, 80);
  const body = clampString(value.body, 500);
  if (!title || !body) return null;
  const takeaway = clampOptionalString(value.takeaway, 140);
  return { title, body, takeaway };
}

function parseHabitTracker(value) {
  if (!Array.isArray(value)) return [];
  const habits = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const label = clampString(entry.label, 80);
    if (!label) continue;
    const target_days = clampInt(entry.target_days, 1, 7);
    if (target_days === null) continue;
    const window = clampOptionalString(entry.window, 24);
    habits.push({ label, target_days, window });
    if (habits.length >= 3) break;
  }
  return habits;
}

function parseReminders(value) {
  if (!Array.isArray(value)) return [];
  const allowed = ['today', 'daily', 'weekly'];
  const reminders = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const at = clampString(entry.at, 24);
    const label = clampString(entry.label, 80);
    if (!at || !label) continue;
    let recurrence = clampString(entry.recurrence, 16).toLowerCase();
    if (!allowed.includes(recurrence)) recurrence = 'today';
    reminders.push({ at, label, recurrence });
    if (reminders.length >= 3) break;
  }
  return reminders;
}

function parseNextScan(value) {
  if (!isPlainObject(value)) return null;
  const allowed = ['face', 'body', 'nutrition', 'super', 'health'];
  const scan_type = clampString(value.scan_type, 16).toLowerCase();
  if (!allowed.includes(scan_type)) return null;
  const in_days = clampInt(value.in_days, 0, 30);
  if (in_days === null) return null;
  const reason = clampOptionalString(value.reason, 160);
  return { scan_type, in_days, reason };
}

function parseSignalWatch(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const signal = clampString(entry.signal, 80);
    const what_to_notice = clampString(entry.what_to_notice, 140);
    if (!signal || !what_to_notice) continue;
    const when_to_escalate = clampOptionalString(entry.when_to_escalate, 160);
    entries.push({ signal, what_to_notice, when_to_escalate });
    if (entries.length >= 3) break;
  }
  return entries;
}


function parseProfileUpdates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowedFocus = ['health', 'body', 'nutrition', 'super'];
  const dietSignals = Array.isArray(value.detected_diet_signals)
    ? value.detected_diet_signals
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 64))
        .slice(0, 5)
    : [];
  const goals = Array.isArray(value.suggested_goals)
    ? value.suggested_goals
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 120))
        .slice(0, 3)
    : [];
  const focusKey =
    typeof value.detected_strong_focus === 'string' &&
    allowedFocus.includes(value.detected_strong_focus)
      ? value.detected_strong_focus
      : null;
  const personaKey =
    typeof value.suggested_persona_key === 'string' && value.suggested_persona_key.trim()
      ? value.suggested_persona_key.trim().slice(0, 40)
      : null;
  if (
    dietSignals.length === 0 &&
    goals.length === 0 &&
    focusKey === null &&
    personaKey === null
  ) {
    return null;
  }
  return {
    detected_diet_signals: dietSignals,
    detected_strong_focus: focusKey,
    suggested_goals: goals,
    suggested_persona_key: personaKey,
  };
}

function parseStreakCelebration(value) {
  if (!isPlainObject(value)) return null;
  const days = clampInt(value.days, 1, 365);
  const message = clampString(value.message, 140);
  if (!days || !message) return null;
  return { days, message };
}

function splitParagraphs(value) {
  if (typeof value !== "string") return [];
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isListLine(line) {
  return /^(?:\u2022|\u2192|\u2713|\u26A0|-)\s+/.test(line);
}

function paragraphHasOnlyPrefixedLines(paragraph) {
  const lines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return false;
  return lines.every((line) => isListLine(line));
}

const COACH_BODY_LOCALES = ['fr', 'en', 'de', 'it', 'es', 'pt'];
const COACH_BODY_DAY_ALIASES = {
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
const COACH_BODY_AGENDA_HEADINGS = {
  fr: ['agenda de la semaine', 'agenda'],
  en: ['weekly schedule', 'week schedule', 'agenda'],
  de: ['wochenplan', 'wochenagenda', 'agenda'],
  it: ['agenda della settimana', 'programma della settimana', 'agenda'],
  es: ['agenda de la semana', 'plan de la semana', 'agenda'],
  pt: ['agenda da semana', 'plano da semana', 'agenda'],
};
const COACH_BODY_ROUTINE_HEADINGS = {
  fr: ['routine'],
  en: ['routine'],
  de: ['routine'],
  it: ['routine'],
  es: ['rutina', 'routine'],
  pt: ['rotina', 'routine'],
};

function normalizeCoachBodyLocale(value) {
  return normalizeLanguageCode(value) || 'fr';
}

function normalizeCoachBodyMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getCoachBodyLocaleOrder(locale) {
  return [locale].concat(COACH_BODY_LOCALES.filter((entry) => entry !== locale));
}

function buildHeadingAlternatives(source, locale) {
  const values = [];
  for (const key of getCoachBodyLocaleOrder(locale)) {
    if (Array.isArray(source[key])) values.push(...source[key]);
  }
  return values;
}

function hasLocalizedHeading(value, headings) {
  const normalized = normalizeCoachBodyMatchText(value);
  return headings.some((heading) => normalized.includes(heading));
}

function hasTimeToken(value) {
  return /\b\d{1,2}(?::\d{2}|h\d{2})\b/i.test(value);
}

function parseDurationMinutes(value) {
  const match = String(value || '').match(/\b(\d{1,3})\s*min\b/i);
  return clampInt(match ? match[1] : null, 1, 180);
}

function hasNonEmptyStructuredValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

function matchScheduleDayLine(value, locale) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = normalizeCoachBodyMatchText(trimmed);

  for (const localeKey of getCoachBodyLocaleOrder(locale)) {
    const aliases = Array.isArray(COACH_BODY_DAY_ALIASES[localeKey])
      ? COACH_BODY_DAY_ALIASES[localeKey]
      : [];
    for (const alias of aliases) {
      if (!normalized.startsWith(alias.match)) continue;
      const boundary = normalized.slice(alias.match.length, alias.match.length + 1);
      if (boundary && /\S/.test(boundary)) continue;
      const remainder = trimmed.slice(alias.match.length).trimStart();
      if (!hasTimeToken(remainder)) continue;
      return { day: alias.label, remainder };
    }
  }

  return null;
}

function findFirstBodyMarkerIndex(bodyText, locale) {
  const candidates = [];
  const checkmarkIndex = bodyText.search(/[\u2713\u2714]/);
  if (checkmarkIndex >= 0) candidates.push(checkmarkIndex);

  const normalizedBody = normalizeCoachBodyMatchText(bodyText);
  const headings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale)
    .concat(buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale));
  for (const heading of headings) {
    const index = normalizedBody.indexOf(heading);
    if (index >= 0) candidates.push(index);
  }

  return candidates.length ? Math.min(...candidates) : -1;
}

function extractSummaryFromBody(bodyText, fallbackText, locale) {
  const normalizedBody = String(bodyText || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedBody) return clampString(fallbackText || '', 280);

  const firstMarkerIndex = findFirstBodyMarkerIndex(normalizedBody, locale);
  const boundaryCandidate =
    firstMarkerIndex > 0 ? normalizedBody.slice(0, firstMarkerIndex).trim() : '';
  if (boundaryCandidate) return clampString(boundaryCandidate, 280);

  const paragraphs = splitParagraphs(normalizedBody);
  const preferred = paragraphs.find((paragraph) => !paragraphHasOnlyPrefixedLines(paragraph));
  return clampString(preferred || paragraphs[0] || fallbackText || '', 280);
}

function stripCoachBodyTailAtHeading(value, locale) {
  const lines = String(value || '').replace(/\r\n/g, '\n').trim().split(/\n/);
  const agendaHeadings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale);
  const routineHeadings = buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale);
  const kept = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length) break;
      continue;
    }

    if (matchScheduleDayLine(trimmed, locale)) break;

    const normalized = normalizeCoachBodyMatchText(trimmed);
    const headingIndex = agendaHeadings
      .concat(routineHeadings)
      .map((heading) => normalized.indexOf(heading))
      .filter((candidate) => candidate >= 0)
      .sort((left, right) => left - right)[0];

    if ((headingIndex ?? -1) >= 0) {
      const beforeHeading = trimmed.slice(0, headingIndex).trim();
      if (beforeHeading) kept.push(beforeHeading);
      break;
    }

    kept.push(trimmed);
  }

  return kept.join(' ').trim();
}

function deriveActionStepsFromBody(bodyText, locale) {
  const normalizedBody = String(bodyText || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedBody) return [];

  const matches = Array.from(normalizedBody.matchAll(/[\u2713\u2714]\s*/g));
  if (!matches.length) return [];

  const steps = [];
  for (let index = 0; index < matches.length; index += 1) {
    if (steps.length >= 4) break;
    const current = matches[index];
    const start = (current.index ?? 0) + current[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : normalizedBody.length;
    const rawStep = stripCoachBodyTailAtHeading(normalizedBody.slice(start, end), locale);
    const cleaned = clampString(rawStep.replace(/\s+/g, ' ').trim(), 200);
    if (cleaned) steps.push(cleaned);
  }

  return steps;
}

function stripAgendaHeadingPrefix(value, locale) {
  const trimmed = String(value || '').trim();
  const normalized = normalizeCoachBodyMatchText(trimmed);
  const headings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale)
    .slice()
    .sort((left, right) => right.length - left.length);

  for (const heading of headings) {
    if (!normalized.startsWith(heading)) continue;
    return trimmed.slice(heading.length).replace(/^[\s:\u2014-]+/, '').trim();
  }

  return trimmed;
}

function deriveDailyScheduleFromBody(bodyText, locale) {
  const normalizedBody = String(bodyText || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedBody) return [];

  const bodyLines = normalizedBody.split(/\n+/);
  const scheduleLines = [];
  const agendaHeadings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale);

  bodyLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (hasLocalizedHeading(trimmed, agendaHeadings)) {
      const remainder = stripAgendaHeadingPrefix(trimmed, locale);
      if (remainder) scheduleLines.push(remainder);
      return;
    }
    scheduleLines.push(trimmed);
  });

  const dayBlocks = [];
  let currentBlock = null;

  scheduleLines.forEach((line) => {
    const dayMatch = matchScheduleDayLine(line, locale);
    if (dayMatch) {
      if (currentBlock && dayBlocks.length < 7) dayBlocks.push(currentBlock);
      currentBlock = { day: dayMatch.day, text: dayMatch.remainder };
      return;
    }

    if (currentBlock) {
      currentBlock.text = (currentBlock.text + ' ' + line).trim();
    }
  });

  if (currentBlock && dayBlocks.length < 7) dayBlocks.push(currentBlock);

  const days = [];
  for (const block of dayBlocks) {
    if (days.length >= 7) break;
    const slots = [];
    const slotMatches = Array.from(block.text.matchAll(/(\d{1,2}(?::\d{2}|h\d{2}))\s*[\u2014-]\s*/gi));
    for (let index = 0; index < slotMatches.length; index += 1) {
      if (slots.length >= 4) break;
      const current = slotMatches[index];
      const start = (current.index ?? 0) + current[0].length;
      const end = slotMatches[index + 1] ? slotMatches[index + 1].index : block.text.length;
      const action = clampString(block.text.slice(start, end).replace(/\s+/g, ' ').trim(), 140);
      const time = clampString(current[1], 16);
      if (!time || !action) continue;
      slots.push({
        time,
        duration_min: parseDurationMinutes(action),
        action,
        tag: null,
      });
    }

    if (slots.length) {
      days.push({
        day: clampString(block.day, 24),
        slots,
      });
    }
  }

  return days;
}

function buildRoutineHeaderPattern(locale) {
  return buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale)
    .slice()
    .sort((left, right) => right.length - left.length)
    .map((entry) => entry.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
    .join('|');
}

function deriveMicroRoutineFromBody(bodyText, locale) {
  const normalizedBody = String(bodyText || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedBody) return [];

  const headerPattern = buildRoutineHeaderPattern(locale);
  if (!headerPattern) return [];

  const routineHeaderRegex = new RegExp('(?:^|\\n|\\s)(?:' + headerPattern + ')\\s*[\\u2014:-]\\s*', 'gi');
  const headerMatches = Array.from(normalizedBody.matchAll(routineHeaderRegex));
  if (!headerMatches.length) return [];

  const agendaHeadings = buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale);
  const routines = [];

  for (let index = 0; index < headerMatches.length; index += 1) {
    if (routines.length >= 2) break;

    const match = headerMatches[index];
    const blockStart = (match.index ?? 0) + match[0].length;
    const blockEnd = headerMatches[index + 1] ? headerMatches[index + 1].index : normalizedBody.length;
    const rawBlock = normalizedBody.slice(blockStart, blockEnd).trim();
    if (!rawBlock) continue;

    const normalizedBlock = normalizeCoachBodyMatchText(rawBlock);
    const agendaIndex = agendaHeadings
      .map((heading) => normalizedBlock.indexOf(heading))
      .filter((candidate) => candidate >= 0)
      .sort((left, right) => left - right)[0];
    const block = (agendaIndex ?? -1) >= 0 ? rawBlock.slice(0, agendaIndex).trim() : rawBlock;
    const stepMatches = Array.from(block.matchAll(/\b\d+[.)]\s*(.+?)(?=(?:\s+\d+[.)]\s)|$)/gis));
    if (!stepMatches.length) continue;

    const headerText = block.slice(0, stepMatches[0].index ?? 0).trim();
    const headerMatch = headerText.match(/^(.*?)(?:\s*\(([^)]+)\))?(?:\s*[\u00b7\u2022-]\s*(\d{1,2})\s*min)?\s*$/i);
    const name = clampString(headerMatch ? headerMatch[1] : headerText, 80);
    if (!name) continue;

    const steps = stepMatches
      .map((stepMatch) => clampString(stepMatch[1].replace(/\s+/g, ' ').trim(), 120))
      .filter(Boolean)
      .slice(0, 6);
    if (!steps.length) continue;

    routines.push({
      name,
      when: clampOptionalString(headerMatch ? headerMatch[2] : null, 40),
      total_min: clampInt(headerMatch ? headerMatch[3] : null, 1, 60),
      steps,
    });
  }

  return routines;
}

function deriveEncouragementFromBody(bodyText, locale, summary) {
  const paragraphs = splitParagraphs(bodyText);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  if (!lastParagraph || lastParagraph === summary || paragraphHasOnlyPrefixedLines(lastParagraph)) {
    return null;
  }

  if (
    hasLocalizedHeading(lastParagraph, buildHeadingAlternatives(COACH_BODY_AGENDA_HEADINGS, locale)) ||
    hasLocalizedHeading(lastParagraph, buildHeadingAlternatives(COACH_BODY_ROUTINE_HEADINGS, locale)) ||
    matchScheduleDayLine(lastParagraph, locale) ||
    hasTimeToken(lastParagraph)
  ) {
    return null;
  }

  return clampOptionalString(lastParagraph, 280);
}

function deriveBodySections(bodyText, locale) {
  if (typeof bodyText !== "string" || !bodyText.trim()) {
    return null;
  }

  const normalizedLocale = normalizeCoachBodyLocale(locale);
  const context_notes = [];
  const priorities = [];
  const prefixedActionSteps = [];
  const warnings = [];

  for (const rawLine of bodyText.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("\u2022 ")) {
      context_notes.push(line.slice(2).trim());
    } else if (line.startsWith("\u2192 ")) {
      priorities.push(line.slice(2).trim());
    } else if (line.startsWith("\u2713 ")) {
      prefixedActionSteps.push(line.slice(2).trim());
    } else if (line.startsWith("\u26A0 ")) {
      warnings.push(line.slice(2).trim());
    } else if (line.startsWith("- ")) {
      context_notes.push(line.slice(2).trim());
    }
  }

  const action_steps = [];
  const seenActionSteps = new Set();
  for (const step of prefixedActionSteps.concat(deriveActionStepsFromBody(bodyText, normalizedLocale))) {
    const cleaned = clampString(step, 200);
    if (!cleaned || seenActionSteps.has(cleaned)) continue;
    seenActionSteps.add(cleaned);
    action_steps.push(cleaned);
    if (action_steps.length >= 4) break;
  }

  const summary = extractSummaryFromBody(bodyText, "", normalizedLocale);

  return {
    summary,
    context_notes,
    priorities,
    action_steps,
    warnings,
    encouragement: deriveEncouragementFromBody(bodyText, normalizedLocale, summary),
    daily_schedule: deriveDailyScheduleFromBody(bodyText, normalizedLocale),
    micro_routine: deriveMicroRoutineFromBody(bodyText, normalizedLocale),
  };
}

function deriveConfidence(explicitValue, scanCount) {
  const explicit = readText(explicitValue);
  if (explicit === "high" || explicit === "medium" || explicit === "low") {
    return explicit;
  }
  if (typeof scanCount !== "number" || !Number.isFinite(scanCount) || scanCount <= 0) {
    return null;
  }
  if (scanCount === 1) return "low";
  if (scanCount === 2) return "medium";
  return "high";
}


const PERSONA_SIGNATURES = {
  gentle_supportive: {
    keywords: ['doucement','douce','propose','sans pression','rythme','gently','pace','suggest','no pressure'],
    defaultOpening: {
      fr: 'On y va doucement.',
      en: "Let's go gently.",
      de: 'Gehen wir es ruhig an.',
      it: 'Andiamo piano.',
      es: 'Vamos despacio.',
      pt: 'Vamos devagar.',
    },
  },
  strict_tough: {
    keywords: ['direct','plan','fioritures','frills','straight','point','klar','dritto','grano','ponto'],
    defaultOpening: {
      fr: 'Direct au but.',
      en: 'Straight to the point.',
      de: 'Direkt zum Punkt.',
      it: 'Dritto al punto.',
      es: 'Directo al grano.',
      pt: 'Direto ao ponto.',
    },
  },
  motivational_energetic: {
    keywords: ['on y va','allez','cap','rythme','push','progression','los','vamos','andiamo','momentum'],
    defaultOpening: {
      fr: 'On y va !',
      en: "Let's go!",
      de: "Los geht's!",
      it: 'Andiamo!',
      es: '¡Vamos!',
      pt: 'Vamos!',
    },
  },
  patient_calm: {
    keywords: ['prenons','moment','rythme','pause','breathing','respirons','calm','nehmen','prendiamoci','tomemos'],
    defaultOpening: {
      fr: 'Prenons un moment.',
      en: "Let's pause.",
      de: 'Nehmen wir uns einen Moment.',
      it: 'Prendiamoci un momento.',
      es: 'Tomemos un momento.',
      pt: 'Vamos pausar.',
    },
  },
  analytical_precise: {
    keywords: ['lecture','donnees','data','synthèse','synthese','numbers','chiffres','tier','priorite','priority','reading','daten'],
    defaultOpening: {
      fr: 'Lecture des données.',
      en: 'Reading the data.',
      de: 'Datenanalyse.',
      it: 'Lettura dei dati.',
      es: 'Lectura de datos.',
      pt: 'Leitura dos dados.',
    },
  },
  playful_light: {
    keywords: ['défi','defi','mini-challenge','challenge','jouons','amuser','fun','sfida','reto','desafio','herausforderung'],
    defaultOpening: {
      fr: 'Petit défi du jour.',
      en: "Today's little challenge.",
      de: 'Kleine Herausforderung für heute.',
      it: 'Piccola sfida del giorno.',
      es: 'Pequeño reto del día.',
      pt: 'Pequeno desafio do dia.',
    },
  },
};

const PERSONA_FORBIDDEN = {
  gentle_supportive: [/\btu dois\b/gi, /\bstoppe\b/gi, /\bforce-toi\b/gi, /\bpousse-toi\b/gi],
  strict_tough: [/\b(essaie|essaye|essayer) de\b/gi, /\bdoucement\b/gi, /\bpeut-être\b/gi, /\bun petit\b/gi, /\bsi tu veux\b/gi, /\btu pourrais\b/gi],
  motivational_energetic: [/\bdoucement\b/gi, /\bprudence\b/gi, /\bsi tu veux\b/gi],
  patient_calm: [/\bvite\b/gi, /\bforce-toi\b/gi, /\bperformance\b/gi, /\bpousse\b/gi],
  analytical_precise: [/\bgénial\b/gi, /\bgenial\b/gi, /\btop\b/gi, /\bsuper\b/gi, /\bincroyable\b/gi, /!{2,}/g, /\b(awesome|amazing|great)\b/gi],
  playful_light: [/\bperformance\b/gi, /\bcontrainte\b/gi],
};

function enforcePersonaSignature(body, personaKey, lang) {
  if (typeof body !== 'string' || !body.trim()) return body;
  const sig = PERSONA_SIGNATURES[personaKey];
  if (!sig) return body;
  const head = body.slice(0, 60).toLowerCase();
  const hasKeyword = sig.keywords.some((kw) => head.indexOf(kw.toLowerCase()) !== -1);
  if (hasKeyword) return body;
  const safeLang = (typeof lang === 'string' && sig.defaultOpening[lang]) ? lang : 'fr';
  const opening = sig.defaultOpening[safeLang] || sig.defaultOpening.fr;
  return opening + ' ' + body;
}

function sweepForbiddenSentences(text, personaKey) {
  if (typeof text !== 'string' || !text.trim()) return text;
  const patterns = PERSONA_FORBIDDEN[personaKey];
  if (!patterns || !patterns.length) return text;
  // Split into sentences while keeping their terminators
  const parts = text.split(/(?<=[.!?\u2026])\s+/);
  const kept = parts.filter((sentence) => !patterns.some((pat) => sentence.search(pat) >= 0));
  const out = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
  return out;
}

function sweepForbiddenItem(text, personaKey) {
  if (typeof text !== 'string' || !text) return text;
  const patterns = PERSONA_FORBIDDEN[personaKey];
  if (!patterns || !patterns.length) return text;
  let cleaned = text;
  for (const pat of patterns) {
    cleaned = cleaned.replace(pat, '');
  }
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:!?\-\u2014]+/, '').replace(/[\s,]+$/, '').trim();
  // If too short or stripped to nothing, return empty (caller will filter)
  if (cleaned.length < 6) return '';
  return cleaned;
}

function enforceForbiddenWords(text, personaKey) {
  // Backward-compat: route to sweepForbiddenSentences (used by content fields in enforcePersonaContract)
  return sweepForbiddenSentences(text, personaKey);
}

function enforcePersonaContract(content, personaKey, localizedCopy) {
  if (!content || typeof personaKey !== "string") return content;
  const safeLocalized = (localizedCopy && typeof localizedCopy === "object") ? localizedCopy : {};

  if (personaKey === "strict_tough") {
    content.encouragement = null;
    if (Array.isArray(content.action_steps)) {
      content.action_steps = content.action_steps
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .map((s) => (s.length > 80 ? s.slice(0, 77).trim() + "…" : s))
        .slice(0, 3);
    }
  }

  if (personaKey === "gentle_supportive") {
    if (!content.encouragement || !String(content.encouragement).trim()) {
      const def = typeof safeLocalized.defaultEncouragement === "string" ? safeLocalized.defaultEncouragement : "";
      if (def) content.encouragement = def;
    }
  }

  if (personaKey === "motivational_energetic") {
    if (!Array.isArray(content.habit_tracker) || content.habit_tracker.length === 0) {
      const defHabit = isPlainObject(safeLocalized.defaultMotivationalHabit) ? safeLocalized.defaultMotivationalHabit : null;
      if (defHabit) {
        const label = typeof defHabit.label === "string" ? defHabit.label.slice(0, 80) : "Bouger 10 min";
        let target = typeof defHabit.target_days === "number" ? Math.round(defHabit.target_days) : 5;
        if (target < 1) target = 1; else if (target > 7) target = 7;
        const window = typeof defHabit.window === "string" ? defHabit.window.slice(0, 24) : "matin";
        content.habit_tracker = [{ label, target_days: target, window }];
      }
    }
  }

  if (personaKey === "analytical_precise") {
    if (!content.confidence) content.confidence = "low";
  }

  if (personaKey === "playful_light") {
    if (Array.isArray(content.action_steps) && content.action_steps.length > 0) {
      const hasChallenge = content.action_steps.some((s) => typeof s === "string" && /^(Défi|Defi|Mini-challenge|Challenge)/i.test(s.trim()));
      if (!hasChallenge) {
        const first = content.action_steps[0];
        if (typeof first === "string" && first.trim()) {
          const prefixed = "Mini-challenge : " + first.trim();
          content.action_steps[0] = prefixed.length > 200 ? prefixed.slice(0, 200).trim() : prefixed;
        }
      }
    }
  }

  
  // Forbidden words sweep on text fields (in-place)
  if (typeof content.summary === 'string') content.summary = enforceForbiddenWords(content.summary, personaKey);
  if (typeof content.encouragement === 'string') content.encouragement = enforceForbiddenWords(content.encouragement, personaKey);
  if (Array.isArray(content.action_steps)) {
    content.action_steps = content.action_steps
      .map((s) => typeof s === 'string' ? sweepForbiddenItem(s, personaKey) : s)
      .filter((s) => typeof s === 'string' && s.trim().length >= 6);
  }
  if (Array.isArray(content.priorities)) {
    content.priorities = content.priorities.map((s) => typeof s === 'string' ? sweepForbiddenItem(s, personaKey) : s).filter((s) => s && s.trim().length >= 3);
  }

  return content;
}

function synthesizeBody(content, sectionLabels) {
  if (!content) return "";

  const labels = sectionLabels || {};
  const parts = [];

  if (content.summary) parts.push(content.summary);

  if (isPlainObject(content.streak_celebration)) {
    parts.push("\u2728 " + content.streak_celebration.days + " j \u2014 " + content.streak_celebration.message);
  }

  if (Array.isArray(content.context_notes) && content.context_notes.length) {
    parts.push(content.context_notes.map((entry) => "\u2022 " + entry).join("\n"));
  }
  if (Array.isArray(content.priorities) && content.priorities.length) {
    parts.push(content.priorities.map((entry) => "\u2192 " + entry).join("\n"));
  }
  if (Array.isArray(content.action_steps) && content.action_steps.length) {
    parts.push(content.action_steps.map((entry) => "\u2713 " + entry).join("\n"));
  }
  if (Array.isArray(content.warnings) && content.warnings.length) {
    parts.push(content.warnings.map((entry) => "\u26A0 " + entry).join("\n"));
  }

  if (Array.isArray(content.daily_schedule) && content.daily_schedule.length) {
    const block = [(labels.daily_schedule || "Agenda") + " :"];
    for (const day of content.daily_schedule) {
      block.push(day.day);
      for (const slot of day.slots) {
        const dur = slot.duration_min ? " (" + slot.duration_min + " min)" : "";
        block.push("  " + slot.time + " \u2014 " + slot.action + dur);
      }
    }
    parts.push(block.join("\n"));
  }

  if (Array.isArray(content.micro_routine) && content.micro_routine.length) {
    for (const routine of content.micro_routine) {
      const head = (labels.micro_routine || "Routine") + " \u2014 " + routine.name + (routine.when ? " (" + routine.when + ")" : "") + (routine.total_min ? " \u00b7 " + routine.total_min + " min" : "");
      const lines = [head];
      routine.steps.forEach((step, idx) => {
        lines.push("  " + (idx + 1) + ". " + step);
      });
      parts.push(lines.join("\n"));
    }
  }

  if (isPlainObject(content.meal_template)) {
    const t = content.meal_template;
    const head = (labels.meal_template || "Prochain repas") + " \u2014 " + t.name + (t.when ? " (" + t.when + ")" : "") + (t.prep_min ? " \u00b7 " + t.prep_min + " min" : "");
    const lines = [head];
    for (const ing of t.ingredients) {
      lines.push("  \u2022 " + ing.item + (ing.portion ? " \u2014 " + ing.portion : ""));
    }
    if (t.why) lines.push(t.why);
    parts.push(lines.join("\n"));
  }

  if (Array.isArray(content.meal_swaps) && content.meal_swaps.length) {
    const block = [(labels.meal_swaps || "Swaps") + " :"];
    for (const swap of content.meal_swaps) {
      block.push("  " + swap.from + " \u2192 " + swap.to + (swap.why ? " (" + swap.why + ")" : ""));
    }
    parts.push(block.join("\n"));
  }

  if (Array.isArray(content.shopping_list) && content.shopping_list.length) {
    const grouped = {};
    for (const it of content.shopping_list) {
      grouped[it.section] = grouped[it.section] || [];
      grouped[it.section].push(it.item);
    }
    const block = [(labels.shopping_list || "Liste de courses") + " :"];
    for (const sec of Object.keys(grouped)) {
      block.push("  [" + sec + "] " + grouped[sec].join(", "));
    }
    parts.push(block.join("\n"));
  }

  if (isPlainObject(content.quick_recipe)) {
    const r = content.quick_recipe;
    const head = (labels.quick_recipe || "Recette flash") + " \u2014 " + r.name + (r.total_min ? " (" + r.total_min + " min)" : "");
    const lines = [head];
    r.steps.forEach((step, idx) => {
      lines.push("  " + (idx + 1) + ". " + step);
    });
    if (Array.isArray(r.tags) && r.tags.length) {
      lines.push("  #" + r.tags.join(" #"));
    }
    parts.push(lines.join("\n"));
  }

  if (isPlainObject(content.knowledge_card)) {
    const k = content.knowledge_card;
    const lines = [(labels.knowledge_card || "\u00c0 retenir") + " \u2014 " + k.title, k.body];
    if (k.takeaway) lines.push("\u2192 " + k.takeaway);
    parts.push(lines.join("\n"));
  }

  if (Array.isArray(content.habit_tracker) && content.habit_tracker.length) {
    const block = [(labels.habit_tracker || "Habitudes") + " :"];
    for (const habit of content.habit_tracker) {
      block.push("  \u2610 " + habit.label + " \u00b7 " + habit.target_days + "j/7" + (habit.window ? " (" + habit.window + ")" : ""));
    }
    parts.push(block.join("\n"));
  }

  if (Array.isArray(content.reminders) && content.reminders.length) {
    const block = [(labels.reminders || "Rappels") + " :"];
    for (const rem of content.reminders) {
      block.push("  " + rem.at + " \u2014 " + rem.label + " (" + rem.recurrence + ")");
    }
    parts.push(block.join("\n"));
  }

  if (isPlainObject(content.next_scan_suggestion)) {
    const ns = content.next_scan_suggestion;
    const whenLabel = ns.in_days === 0 ? (labels.next_scan_now || "maintenant") : ((labels.next_scan_in || "dans") + " " + ns.in_days + (labels.next_scan_days || "j"));
    parts.push((labels.next_scan || "Prochain scan") + " \u2014 " + ns.scan_type + " " + whenLabel + (ns.reason ? " : " + ns.reason : ""));
  }

  if (Array.isArray(content.signal_watch) && content.signal_watch.length) {
    const block = [(labels.signal_watch || "\u00c0 surveiller") + " :"];
    for (const s of content.signal_watch) {
      block.push("  \u26A0 " + s.signal + " \u2014 " + s.what_to_notice + (s.when_to_escalate ? " (" + s.when_to_escalate + ")" : ""));
    }
    parts.push(block.join("\n"));
  }

  if (content.encouragement) parts.push(content.encouragement);

  return parts.join("\n\n").trim();
}

const determineContext = safeNodeItemJson("Determine Coach Route");
const fallbackContext = safeNodeItemJson("Normalize Coach Input1");
const upstreamContext =
  isPlainObject(determineContext) && Object.keys(determineContext).length > 0
    ? determineContext
    : fallbackContext;

const currentBodyContext = isPlainObject($json?.body) ? $json.body : {};
const languageCode =
  normalizeLanguageCode($json?.language) ??
  normalizeLanguageCode($json?.locale) ??
  normalizeLanguageCode(currentBodyContext.language) ??
  normalizeLanguageCode(currentBodyContext.locale) ??
  normalizeLanguageCode(determineContext?.language) ??
  normalizeLanguageCode(determineContext?.locale) ??
  normalizeLanguageCode(fallbackContext?.language) ??
  normalizeLanguageCode(fallbackContext?.locale) ??
  "fr";

const FALLBACK_COPY = {
  fr: {
    defaultTitle: "Ton bilan coach",
    defaultBody: "Je n'ai pas pu formuler un conseil personnalise fiable a partir des informations disponibles. Reessaie avec un scan recent pour obtenir un retour plus utile.",
    noScanBody: "Il n'y a pas encore de scan recent a analyser. Fais un nouveau scan pour obtenir un conseil personnalise et commence aujourd'hui par une action simple et realiste.",
    defaultDisclaimer: "Conseil bien-etre uniquement. Ceci ne remplace pas un avis medical.",
    genericError: "Un conseil personnalise n'est pas disponible pour le moment. Reessaie dans un instant.",
    noScanAction: "Faire un scan recent pour debloquer un conseil personnalise.",
    routeTitles: {
      free_question: "Ta question coach",
      latest_scan: "Ton dernier scan",
      weekly_plan: "Ton plan de la semaine",
      nutrition_focus: "Ton focus nutrition",
      body_focus: "Ton focus corps",
      face_focus: "Ton focus visage",
      hydration_focus: "Ton focus hydratation",
      sleep_coach: "Ton focus recuperation",
      risk_watch: "Points de vigilance",
      recovery_plan: "Ton plan de recuperation",
      trend_comparison: "Ton evolution recente",
      no_scan: "Commencer avec un scan",
      general_fallback: "Ton bilan coach",
    },
    sectionLabels: {
      daily_schedule: "Agenda de la semaine",
      micro_routine: "Routine",
      meal_template: "Prochain repas",
      meal_swaps: "Echanges malins",
      shopping_list: "Liste de courses",
      quick_recipe: "Recette flash",
      knowledge_card: "A retenir",
      habit_tracker: "Habitudes a tenir",
      reminders: "Rappels",
      next_scan: "Prochain scan",
      next_scan_now: "maintenant",
      next_scan_in: "dans",
      next_scan_days: "j",
      signal_watch: "A surveiller",
    },
    ctaScanLabels: {
      face: 'Scanner mon visage',
      body: 'Scanner mon corps',
      nutrition: 'Scanner mon repas',
      super: 'Faire un scan complet',
      default: 'Scanner',
    },
    defaultEncouragement: "Tu fais déjà beaucoup, garde le cap à ton rythme.",
    defaultMotivationalHabit: { label: "Bouger 10 min", target_days: 5, window: "matin" },
  },
  en: {
    defaultTitle: "Your coach summary",
    defaultBody: "I could not build a reliable personalized coaching summary from the available information. Try again with a recent scan for clearer guidance.",
    noScanBody: "There is no recent scan to review yet. Take a new scan to unlock personalized guidance and start today with one simple realistic action.",
    defaultDisclaimer: "Wellness guidance only. This is not medical advice.",
    genericError: "A personalized coaching note is not available right now. Please try again shortly.",
    noScanAction: "Take a recent scan to unlock personalized guidance.",
    routeTitles: {
      free_question: "Your coach question",
      latest_scan: "Your latest scan",
      weekly_plan: "Your weekly plan",
      nutrition_focus: "Your nutrition focus",
      body_focus: "Your body focus",
      face_focus: "Your face focus",
      hydration_focus: "Your hydration focus",
      sleep_coach: "Your recovery focus",
      risk_watch: "Key watchpoints",
      recovery_plan: "Your recovery plan",
      trend_comparison: "Your recent progress",
      no_scan: "Start with a scan",
      general_fallback: "Your coach summary",
    },
    sectionLabels: {
      daily_schedule: "Your weekly agenda",
      micro_routine: "Routine",
      meal_template: "Next meal",
      meal_swaps: "Smart swaps",
      shopping_list: "Shopping list",
      quick_recipe: "Quick recipe",
      knowledge_card: "Good to know",
      habit_tracker: "Habits to keep",
      reminders: "Reminders",
      next_scan: "Next scan",
      next_scan_now: "now",
      next_scan_in: "in",
      next_scan_days: "d",
      signal_watch: "Watch for",
    },
    ctaScanLabels: {
      face: 'Scan my face',
      body: 'Scan my body',
      nutrition: 'Scan my meal',
      super: 'Full scan',
      default: 'Scan',
    },
    defaultEncouragement: "You are doing well, keep your pace.",
    defaultMotivationalHabit: { label: "Move 10 min", target_days: 5, window: "morning" },
  },
  de: {
    defaultTitle: "Deine Coach-Zusammenfassung",
    defaultBody: "Ich konnte aus den verfuegbaren Informationen keine verlaessliche personalisierte Coach-Zusammenfassung erstellen. Versuche es mit einem aktuellen Scan noch einmal.",
    noScanBody: "Es gibt noch keinen aktuellen Scan zur Analyse. Mache einen neuen Scan fuer personalisierte Hinweise und starte heute mit einer einfachen realistischen Aktion.",
    defaultDisclaimer: "Nur Wellness-Hinweise. Das ist kein medizinischer Rat.",
    genericError: "Ein personalisierter Coach-Hinweis ist im Moment nicht verfuegbar. Bitte versuche es gleich noch einmal.",
    noScanAction: "Einen aktuellen Scan machen, um personalisierte Hinweise zu erhalten.",
    routeTitles: {
      free_question: "Deine Coach-Frage",
      latest_scan: "Dein letzter Scan",
      weekly_plan: "Dein Wochenplan",
      nutrition_focus: "Dein Ernaehrungsfokus",
      body_focus: "Dein Koerperfokus",
      face_focus: "Dein Gesichtsfokus",
      hydration_focus: "Dein Hydrationsfokus",
      sleep_coach: "Dein Erholungsfokus",
      risk_watch: "Wichtige Hinweise",
      recovery_plan: "Dein Erholungsplan",
      trend_comparison: "Deine juengste Entwicklung",
      no_scan: "Mit einem Scan starten",
      general_fallback: "Deine Coach-Zusammenfassung",
    },
    sectionLabels: {
      daily_schedule: "Wochenagenda",
      micro_routine: "Routine",
      meal_template: "Naechste Mahlzeit",
      meal_swaps: "Clevere Tausche",
      shopping_list: "Einkaufsliste",
      quick_recipe: "Schnellrezept",
      knowledge_card: "Gut zu wissen",
      habit_tracker: "Gewohnheiten",
      reminders: "Erinnerungen",
      next_scan: "Naechster Scan",
      next_scan_now: "jetzt",
      next_scan_in: "in",
      next_scan_days: "T",
      signal_watch: "Beachten",
    },
    ctaScanLabels: {
      face: 'Gesicht scannen',
      body: 'Koerper scannen',
      nutrition: 'Mahlzeit scannen',
      super: 'Komplett-Scan',
      default: 'Scannen',
    },
    defaultEncouragement: "Du machst das gut, bleib in deinem Tempo dran.",
    defaultMotivationalHabit: { label: "10 Min bewegen", target_days: 5, window: "morgens" },
  },
  it: {
    defaultTitle: "Il tuo riepilogo coach",
    defaultBody: "Non sono riuscito a creare un riepilogo coach personalizzato e affidabile dalle informazioni disponibili. Riprova con una scansione recente per avere indicazioni piu chiare.",
    noScanBody: "Non c'e ancora una scansione recente da analizzare. Fai una nuova scansione per ottenere indicazioni personalizzate e inizia oggi con un'azione semplice e realistica.",
    defaultDisclaimer: "Indicazioni di benessere soltanto. Non e un consiglio medico.",
    genericError: "Un consiglio personalizzato non e disponibile in questo momento. Riprova tra poco.",
    noScanAction: "Fare una scansione recente per sbloccare indicazioni personalizzate.",
    routeTitles: {
      free_question: "La tua domanda al coach",
      latest_scan: "La tua ultima scansione",
      weekly_plan: "Il tuo piano settimanale",
      nutrition_focus: "Il tuo focus nutrizione",
      body_focus: "Il tuo focus corpo",
      face_focus: "Il tuo focus viso",
      hydration_focus: "Il tuo focus idratazione",
      sleep_coach: "Il tuo focus recupero",
      risk_watch: "Punti di attenzione",
      recovery_plan: "Il tuo piano di recupero",
      trend_comparison: "I tuoi progressi recenti",
      no_scan: "Inizia con una scansione",
      general_fallback: "Il tuo riepilogo coach",
    },
    sectionLabels: {
      daily_schedule: "Agenda settimanale",
      micro_routine: "Routine",
      meal_template: "Prossimo pasto",
      meal_swaps: "Scambi furbi",
      shopping_list: "Lista della spesa",
      quick_recipe: "Ricetta flash",
      knowledge_card: "Da sapere",
      habit_tracker: "Abitudini",
      reminders: "Promemoria",
      next_scan: "Prossima scansione",
      next_scan_now: "subito",
      next_scan_in: "tra",
      next_scan_days: "g",
      signal_watch: "Da osservare",
    },
    ctaScanLabels: {
      face: 'Scansiona viso',
      body: 'Scansiona corpo',
      nutrition: 'Scansiona pasto',
      super: 'Scansione completa',
      default: 'Scansiona',
    },
    defaultEncouragement: "Stai facendo bene, mantieni il tuo ritmo.",
    defaultMotivationalHabit: { label: "Muoviti 10 min", target_days: 5, window: "mattina" },
  },
  es: {
    defaultTitle: "Tu resumen del coach",
    defaultBody: "No pude crear un resumen personalizado y fiable a partir de la informacion disponible. Intentalo de nuevo con un escaneo reciente para obtener una orientacion mas clara.",
    noScanBody: "Todavia no hay un escaneo reciente para analizar. Haz un nuevo escaneo para obtener orientacion personalizada y empieza hoy con una accion simple y realista.",
    defaultDisclaimer: "Orientacion de bienestar unicamente. No es un consejo medico.",
    genericError: "Una orientacion personalizada no esta disponible en este momento. Intentalo de nuevo en breve.",
    noScanAction: "Hacer un escaneo reciente para obtener orientacion personalizada.",
    routeTitles: {
      free_question: "Tu pregunta al coach",
      latest_scan: "Tu ultimo escaneo",
      weekly_plan: "Tu plan semanal",
      nutrition_focus: "Tu foco de nutricion",
      body_focus: "Tu foco corporal",
      face_focus: "Tu foco facial",
      hydration_focus: "Tu foco de hidratacion",
      sleep_coach: "Tu foco de recuperacion",
      risk_watch: "Puntos de vigilancia",
      recovery_plan: "Tu plan de recuperacion",
      trend_comparison: "Tu evolucion reciente",
      no_scan: "Empieza con un escaneo",
      general_fallback: "Tu resumen del coach",
    },
    sectionLabels: {
      daily_schedule: "Tu agenda semanal",
      micro_routine: "Rutina",
      meal_template: "Proxima comida",
      meal_swaps: "Cambios inteligentes",
      shopping_list: "Lista de compras",
      quick_recipe: "Receta rapida",
      knowledge_card: "Para saber",
      habit_tracker: "Habitos",
      reminders: "Recordatorios",
      next_scan: "Proximo escaneo",
      next_scan_now: "ahora",
      next_scan_in: "en",
      next_scan_days: "d",
      signal_watch: "A observar",
    },
    ctaScanLabels: {
      face: 'Escanear cara',
      body: 'Escanear cuerpo',
      nutrition: 'Escanear comida',
      super: 'Escaneo completo',
      default: 'Escanear',
    },
    defaultEncouragement: "Lo estás haciendo bien, mantén tu ritmo.",
    defaultMotivationalHabit: { label: "Mover 10 min", target_days: 5, window: "mañana" },
  },
  pt: {
    defaultTitle: "O teu resumo do coach",
    defaultBody: "Nao consegui criar um resumo personalizado e fiavel a partir das informacoes disponiveis. Tenta novamente com um scan recente para obter uma orientacao mais clara.",
    noScanBody: "Ainda nao existe um scan recente para analisar. Faz um novo scan para obter orientacao personalizada e comeca hoje com uma acao simples e realista.",
    defaultDisclaimer: "Orientacao de bem-estar apenas. Isto nao e um conselho medico.",
    genericError: "Uma orientacao personalizada nao esta disponivel neste momento. Tenta novamente daqui a pouco.",
    noScanAction: "Fazer um scan recente para desbloquear orientacao personalizada.",
    routeTitles: {
      free_question: "A tua pergunta ao coach",
      latest_scan: "O teu ultimo scan",
      weekly_plan: "O teu plano semanal",
      nutrition_focus: "O teu foco de nutricao",
      body_focus: "O teu foco corporal",
      face_focus: "O teu foco facial",
      hydration_focus: "O teu foco de hidratacao",
      sleep_coach: "O teu foco de recuperacao",
      risk_watch: "Pontos de atencao",
      recovery_plan: "O teu plano de recuperacao",
      trend_comparison: "A tua evolucao recente",
      no_scan: "Comeca com um scan",
      general_fallback: "O teu resumo do coach",
    },
    sectionLabels: {
      daily_schedule: "Agenda da semana",
      micro_routine: "Rotina",
      meal_template: "Proxima refeicao",
      meal_swaps: "Trocas inteligentes",
      shopping_list: "Lista de compras",
      quick_recipe: "Receita rapida",
      knowledge_card: "A saber",
      habit_tracker: "Habitos",
      reminders: "Lembretes",
      next_scan: "Proximo scan",
      next_scan_now: "agora",
      next_scan_in: "em",
      next_scan_days: "d",
      signal_watch: "A observar",
    },
    ctaScanLabels: {
      face: 'Scanear rosto',
      body: 'Scanear corpo',
      nutrition: 'Scanear refeicao',
      super: 'Scan completo',
      default: 'Scanear',
    },
    defaultEncouragement: "Estás a fazer bem, mantém o teu ritmo.",
    defaultMotivationalHabit: { label: "Mexer-te 10 min", target_days: 5, window: "manhã" },
  },
};

const localizedCopy = FALLBACK_COPY[languageCode] ?? FALLBACK_COPY.fr;
const scanContext = isPlainObject(upstreamContext.scan_context) ? upstreamContext.scan_context : {};
const recentScans = Array.isArray(scanContext.recent_scans) ? scanContext.recent_scans : [];
const priorScans = Array.isArray(scanContext.prior_scans) ? scanContext.prior_scans : [];
const scanCount =
  recentScans.length +
  priorScans.length +
  (scanContext.has_any_scan === true && recentScans.length + priorScans.length === 0 ? 1 : 0);
const comparisonAvailable =
  upstreamContext?.comparison_to_previous?.available === true ||
  scanContext?.comparison_to_previous?.available === true;
const coachRoute = readText(upstreamContext?.coach_route) || "general_fallback";
const coachRouteTitleKeyByRoute = {
  nutrition_meal: "nutrition_focus",
  nutrition_swaps: "nutrition_focus",
  nutrition_shopping: "nutrition_focus",
  risk_watch_calm: "risk_watch",
  risk_watch_escalation: "risk_watch",
  risk_watch_logging: "risk_watch",
  recovery_reset_48h: "recovery_plan",
  recovery_restart: "recovery_plan",
  trend_review_summary: "trend_comparison",
  trend_review_blocked: "trend_comparison",
  trend_review_continue: "trend_comparison",
};
const coachRouteTitleKey = coachRouteTitleKeyByRoute[coachRoute] || coachRoute;

const topLevelCandidates = [
  $json?.message?.content,
  $json?.choices?.[0]?.message?.content,
  $json?.content,
  $json?.output,
  $json?.text,
  $json?.response,
  $json?.data,
  $json,
];

let firstObject = null;
let parsed = null;

candidateLoop:
for (const candidate of topLevelCandidates) {
  if (candidate === undefined || candidate === null) {
    continue;
  }

  const objects = collectObjectsFromValue(candidate, 0);
  for (const objectCandidate of objects) {
    if (!isPlainObject(objectCandidate)) {
      continue;
    }

    if (!firstObject) {
      firstObject = objectCandidate;
    }

    if (isCoachPayloadLike(objectCandidate)) {
      parsed = objectCandidate;
      break candidateLoop;
    }
  }
}

if (!parsed) {
  parsed = firstObject;
}

if (!isPlainObject(parsed)) {
  parsed = {};
}

const fallbackTitle = clampString(
  localizedCopy.routeTitles[coachRouteTitleKey] ?? localizedCopy.defaultTitle,
  80,
);
const fallbackBody = coachRoute === "no_scan" ? localizedCopy.noScanBody : localizedCopy.defaultBody;
const rawBodySections = deriveBodySections(parsed.body ?? "", languageCode);
const rawContent = isPlainObject(parsed.content) ? parsed.content : {};
const mergedStructuredSource = {
  ...parsed,
  ...rawContent,
};
for (const key of [
  "summary",
  "context_notes",
  "priorities",
  "action_steps",
  "warnings",
  "encouragement",
  "daily_schedule",
  "micro_routine",
]) {
  if (
    !hasNonEmptyStructuredValue(mergedStructuredSource[key]) &&
    hasNonEmptyStructuredValue(rawBodySections?.[key])
  ) {
    mergedStructuredSource[key] = rawBodySections[key];
  }
}

let content = {
  title: clampString(mergedStructuredSource.title ?? fallbackTitle, 80),
  summary: clampString(
    mergedStructuredSource.summary ?? rawBodySections?.summary ?? "",
    280,
  ),
  context_notes: clampArray(
    mergedStructuredSource.context_notes ?? rawBodySections?.context_notes,
    3,
    240,
  ),
  priorities: clampArray(
    mergedStructuredSource.priorities ?? rawBodySections?.priorities,
    3,
    180,
  ),
  action_steps: clampArray(
    mergedStructuredSource.action_steps ?? rawBodySections?.action_steps,
    4,
    200,
  ),
  warnings: clampArray(
    mergedStructuredSource.warnings ?? rawBodySections?.warnings,
    3,
    200,
  ),
  encouragement: clampOptionalString(
    mergedStructuredSource.encouragement ?? rawBodySections?.encouragement,
    280,
  ),
  primary_metric_delta: parseMetricDelta(
    mergedStructuredSource.primary_metric_delta,
    comparisonAvailable,
  ),
  data_gaps: clampArray(mergedStructuredSource.data_gaps, 3, 160),
  confidence: deriveConfidence(mergedStructuredSource.confidence, scanCount),
  daily_schedule: parseDailySchedule(mergedStructuredSource.daily_schedule),
  micro_routine: parseMicroRoutine(mergedStructuredSource.micro_routine),
  meal_template: parseMealTemplate(mergedStructuredSource.meal_template),
  meal_swaps: parseMealSwaps(mergedStructuredSource.meal_swaps),
  shopping_list: parseShoppingList(mergedStructuredSource.shopping_list),
  quick_recipe: parseQuickRecipe(mergedStructuredSource.quick_recipe),
  knowledge_card: parseKnowledgeCard(mergedStructuredSource.knowledge_card),
  habit_tracker: parseHabitTracker(mergedStructuredSource.habit_tracker),
  reminders: parseReminders(mergedStructuredSource.reminders),
  next_scan_suggestion: parseNextScan(mergedStructuredSource.next_scan_suggestion),
  signal_watch: parseSignalWatch(mergedStructuredSource.signal_watch),
  streak_celebration: parseStreakCelebration(mergedStructuredSource.streak_celebration),
  profile_updates: parseProfileUpdates(mergedStructuredSource.profile_updates),
};

const hasMeaningfulContent =
  !!content.title &&
  (
    !!content.summary ||
    content.context_notes.length > 0 ||
    content.priorities.length > 0 ||
    content.action_steps.length > 0 ||
    content.warnings.length > 0 ||
    !!content.encouragement ||
    content.data_gaps.length > 0 ||
    content.daily_schedule.length > 0 ||
    content.micro_routine.length > 0 ||
    !!content.meal_template ||
    content.meal_swaps.length > 0 ||
    content.shopping_list.length > 0 ||
    !!content.quick_recipe ||
    !!content.knowledge_card ||
    content.habit_tracker.length > 0 ||
    content.reminders.length > 0 ||
    !!content.next_scan_suggestion ||
    content.signal_watch.length > 0 ||
    !!content.streak_celebration ||
    !!content.profile_updates
  );

if (coachRoute === "no_scan") {
  content = {
    title: fallbackTitle,
    summary: clampString(localizedCopy.noScanBody, 280),
    context_notes: [],
    priorities: [],
    action_steps: [clampString(localizedCopy.noScanAction, 200)].filter(Boolean),
    warnings: [],
    encouragement: null,
    primary_metric_delta: null,
    data_gaps: [],
    confidence: deriveConfidence(null, scanCount),
    daily_schedule: [],
    micro_routine: [],
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
} else if (!hasMeaningfulContent) {
  content = {
    title: fallbackTitle,
    summary: clampString(
      extractSummaryFromBody(parsed.body ?? "", fallbackBody) || fallbackBody,
      280,
    ),
    context_notes: [],
    priorities: [],
    action_steps:
      coachRoute === "no_scan"
        ? [clampString(localizedCopy.noScanAction, 200)].filter(Boolean)
        : [],
    warnings: [],
    encouragement: null,
    primary_metric_delta: null,
    data_gaps: [],
    confidence: deriveConfidence(null, scanCount),
    daily_schedule: [],
    micro_routine: [],
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

const finalTitle = coachRoute === "no_scan"
  ? fallbackTitle
  : (
    clampString(parsed.title, 80) ||
    clampString(content.title, 80) ||
    fallbackTitle ||
    clampString(localizedCopy.defaultTitle, 80)
  );

content.title = finalTitle;

const personaKeyForEnforcement = (typeof upstreamContext.persona_key === "string" && upstreamContext.persona_key.trim()) ? upstreamContext.persona_key.trim() : "gentle_supportive";
enforcePersonaContract(content, personaKeyForEnforcement, localizedCopy);
const synthesizedBody = synthesizeBody(content, localizedCopy.sectionLabels);
const finalBody = coachRoute === "no_scan"
  ? (
    clampString(
      firstNonEmptyString([
        synthesizedBody,
        localizedCopy.noScanBody,
        localizedCopy.genericError,
      ]),
      4000,
    ) ||
    clampString(localizedCopy.genericError, 4000)
  )
  : (
    clampString(
      firstNonEmptyString([
        parsed.body,
        synthesizedBody,
        fallbackBody,
        localizedCopy.genericError,
      ]),
      4000,
    ) ||
    clampString(localizedCopy.genericError, 4000)
  );


let finalBodyClean = sweepForbiddenSentences(finalBody, personaKeyForEnforcement);
finalBodyClean = enforcePersonaSignature(finalBodyClean, personaKeyForEnforcement, languageCode);
if (!finalBodyClean || !finalBodyClean.trim()) {
  finalBodyClean = clampString(localizedCopy.genericError, 4000) || finalBody;
}

const finalDisclaimer =
  clampString(parsed.disclaimer, 240) ||
  clampString(localizedCopy.defaultDisclaimer, 240) ||
  clampString(localizedCopy.genericError, 240);

if (!content.summary) {
  content.summary =
    clampString(
      extractSummaryFromBody(finalBodyClean, fallbackBody) || fallbackBody || localizedCopy.genericError,
      280,
    ) ||
    clampString(localizedCopy.genericError, 280);
}

const derivedCta = (function() {
  const ns = content.next_scan_suggestion;
  if (!ns || !ns.scan_type) return { label: null, route: null };
  const ctaMap = isPlainObject(localizedCopy.ctaScanLabels) ? localizedCopy.ctaScanLabels : {};
  return {
    label: ctaMap[ns.scan_type] || ctaMap.default || null,
    route: '/scan/' + ns.scan_type,
  };
})();

return [
  {
    json: {
      response_version: 2,
      title: finalTitle,
      body: finalBodyClean,
      disclaimer: finalDisclaimer,
      cta_label: clampOptionalString(parsed.cta_label, 40) || derivedCta.label,
      cta_route: readText(parsed.cta_route) || derivedCta.route,
      content,
      source: "n8n",
    },
  },
];