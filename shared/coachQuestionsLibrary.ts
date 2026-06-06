// Bibliothèque scalable de questions coach suggérées depuis les scans.
//
// Audit produit 2026-05-26 (cf. [[audit-produit-premium-gating-2026-05-26]]) :
// le pattern hardcodé "Comment améliorer X à partir de mon dernier scan ?"
// (22 `MetricDefinition` × 2-3 variantes = ~66 questions max) rend les
// suggestions répétitives, peu actionnables et sans horizon temporel.
//
// Cette bibliothèque ajoute une couche de wording riche, traduit dans les
// 6 locales et indexée par (scanType, metricKey, severity, timeHorizon).
// Elle est consommée par `scanCoachIntent.resolveDisplayQuestionText()`
// pour produire `intent.question_text` ; le routage n8n
// (`presetRouteKeyFree`/`Premium`) reste inchangé pour ne pas casser
// `buildCoachGenerationInputFromScanCoachIntent`.
//
// Wildcards :
//   - `metricKey: '*'` → fallback pour tout le scanType
//   - `severity: 'any'` → fallback toutes sévérités
//
// Anti-répétition :
//   - L'appelant peut passer `recentlyUsedIds` (les N derniers `id` rendus)
//   - La sélection préfère un id absent de la liste mais reste déterministe
//
// Sélection déterministe :
//   - Tri par `rotationPriority` puis ordre du tableau
//   - Index choisi via `hashSeed(scanId + metricKey) % candidates.length`

import type {
  CoachQuestionKey,
  CoachQuestionLocale,
} from './coachQuestions.ts';

export type CoachQuestionLibraryScanType =
  | 'face'
  | 'body'
  | 'nutrition'
  | 'fridge'
  | 'super';

export type CoachQuestionLibrarySeverity = 'low' | 'medium' | 'high' | 'any';

export type CoachQuestionLibraryTimeHorizon =
  | 'now_5m'
  | 'today_1h'
  | 'tonight_12h'
  | '48h'
  | 'week_5d'
  | 'ongoing';

export type CoachQuestionLibraryTimeOfDay =
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night';

export type CoachQuestionLibraryTag =
  | 'quick'
  | 'plan'
  | 'recovery'
  | 'starter'
  | 'tracking';

export interface CoachQuestionLibraryEntry {
  /** Stable identifier — used for anti-repetition tracking. */
  id: string;
  scanType: CoachQuestionLibraryScanType;
  /** Metric key in the scan payload, or `'*'` to match any metric of the scanType. */
  metricKey: string;
  severity: CoachQuestionLibrarySeverity;
  timeHorizon: CoachQuestionLibraryTimeHorizon;
  /** Optional preferred time of day — used as a soft scoring boost. */
  preferredTimeOfDay?: CoachQuestionLibraryTimeOfDay;
  questions: Record<CoachQuestionLocale, string>;
  /** n8n route preset for free users. Routed via `getCoachQuestionDefinition`. */
  presetRouteKeyFree: CoachQuestionKey;
  /** n8n route preset for premium users. Routed via `getCoachQuestionDefinition`. */
  presetRouteKeyPremium: CoachQuestionKey;
  tags: CoachQuestionLibraryTag[];
  /** Lower = picked first when equally relevant. */
  rotationPriority: number;
}

// ─── Helpers internes ──────────────────────────────────────────────────────

function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function normalizeLocale(
  locale: string | null | undefined,
): CoachQuestionLocale {
  const lowered = String(locale ?? '').trim().toLowerCase();
  if (lowered.startsWith('fr')) return 'fr';
  if (lowered.startsWith('en')) return 'en';
  if (lowered.startsWith('de')) return 'de';
  if (lowered.startsWith('it')) return 'it';
  if (lowered.startsWith('es')) return 'es';
  if (lowered.startsWith('pt')) return 'pt';
  return 'fr';
}

function severityMatches(
  entry: CoachQuestionLibraryEntry,
  severity: CoachQuestionLibrarySeverity | null | undefined,
): boolean {
  if (entry.severity === 'any') return true;
  if (!severity || severity === 'any') return true;
  return entry.severity === severity;
}

// ─── API publique ──────────────────────────────────────────────────────────

export interface SelectCoachQuestionOptions {
  scanType: CoachQuestionLibraryScanType;
  metricKey: string;
  severity?: CoachQuestionLibrarySeverity | null;
  locale?: string | null;
  scanId?: string | null;
  timeOfDay?: CoachQuestionLibraryTimeOfDay | null;
  /** Last N entry ids rendered for this user/metric — softly avoided. */
  recentlyUsedIds?: readonly string[];
  /** Restrict pool — used by tests; production code rarely sets this. */
  library?: readonly CoachQuestionLibraryEntry[];
}

export interface CoachQuestionLibrarySelection {
  entry: CoachQuestionLibraryEntry;
  questionText: string;
}

/**
 * Renvoie la liste des entrées candidates pour un (scanType, metricKey,
 * severity), avec fallback metric-wildcard puis severity-wildcard.
 *
 * L'ordre des candidats reflète la spécificité :
 *   1. metricKey exact + severity exacte
 *   2. metricKey exact + severity=any
 *   3. metricKey=* + severity exacte
 *   4. metricKey=* + severity=any
 */
export function filterCoachQuestionLibraryEntries(
  options: SelectCoachQuestionOptions,
): CoachQuestionLibraryEntry[] {
  const pool = options.library ?? COACH_QUESTION_LIBRARY;
  const buckets: CoachQuestionLibraryEntry[][] = [[], [], [], []];

  for (const entry of pool) {
    if (entry.scanType !== options.scanType) continue;
    const matchesMetric = entry.metricKey === options.metricKey;
    const matchesWildcardMetric = entry.metricKey === '*';
    if (!matchesMetric && !matchesWildcardMetric) continue;
    if (!severityMatches(entry, options.severity ?? null)) continue;

    const isExactSeverity =
      options.severity && options.severity !== 'any'
        ? entry.severity === options.severity
        : false;

    if (matchesMetric && isExactSeverity) buckets[0].push(entry);
    else if (matchesMetric) buckets[1].push(entry);
    else if (isExactSeverity) buckets[2].push(entry);
    else buckets[3].push(entry);
  }

  const sortBucket = (bucket: CoachQuestionLibraryEntry[]) =>
    [...bucket].sort((a, b) => a.rotationPriority - b.rotationPriority);

  return buckets.flatMap(sortBucket);
}

/**
 * Sélectionne déterministiquement une entrée parmi les candidats.
 *
 * - Si `recentlyUsedIds` est fourni, élimine d'abord les entrées qui y
 *   figurent. Si tout est filtré, on retombe sur tous les candidats.
 * - Boost optionnel `preferredTimeOfDay` ↔ `timeOfDay` (entrées matchantes
 *   placées en tête en respectant leur priorité).
 * - Index final = `hashSeed(scanId + metricKey) % length` → stable pour un
 *   même scan tant que `recentlyUsedIds` ne change pas.
 */
export function selectCoachQuestionFromLibrary(
  options: SelectCoachQuestionOptions,
): CoachQuestionLibrarySelection | null {
  const candidates = filterCoachQuestionLibraryEntries(options);
  if (candidates.length === 0) return null;

  const recentlyUsed = new Set(options.recentlyUsedIds ?? []);
  const fresh =
    recentlyUsed.size > 0
      ? candidates.filter((entry) => !recentlyUsed.has(entry.id))
      : candidates;
  const pool = fresh.length > 0 ? fresh : candidates;

  // Time-of-day filter : si au moins une entrée matche l'heure demandée,
  //   on restreint le pool à ces entrées. Sinon on garde le pool complet.
  //   Cela rend le `preferredTimeOfDay` un vrai sélecteur (et pas juste un
  //   réordonnancement) — la rotation déterministe choisit ensuite dans le
  //   sous-pool restreint.
  const timeFiltered = options.timeOfDay
    ? pool.filter((entry) => entry.preferredTimeOfDay === options.timeOfDay)
    : pool;
  const finalPool = timeFiltered.length > 0 ? timeFiltered : pool;

  const seed = `${options.scanId ?? ''}:${options.metricKey}`;
  const index = finalPool.length > 1 ? hashSeed(seed) % finalPool.length : 0;
  const entry = finalPool[index];

  const locale = normalizeLocale(options.locale);
  const questionText = entry.questions[locale] ?? entry.questions.fr;

  return { entry, questionText };
}

// ─── Seed initial — première vague large ───────────────────────────────────
// On vise ~100 questions par scanner à terme. Cette PR pose ~120 entrées
// reparties sur les métriques prioritaires (cf. audit).
//
// Les `presetRouteKeyFree`/`Premium` doivent rester dans `CoachQuestionKey`
// pour garantir que `buildCoachGenerationInputFromScanCoachIntent` route
// correctement vers n8n. Cf. `coachQuestions.ts:COACH_QUESTION_DEFINITIONS`.

const fr_en_de_it_es_pt = <T extends Record<CoachQuestionLocale, string>>(
  questions: T,
) => questions;

export const COACH_QUESTION_LIBRARY: readonly CoachQuestionLibraryEntry[] = [
  // ─── FACE • fatigue_level ───────────────────────────────────────────────
  {
    id: 'face_fatigue_now_10min',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'Si je n’ai que 10 minutes, je fais quoi pour relâcher la fatigue ?',
      en: 'If I only have 10 minutes, what do I do to ease my fatigue?',
      de: 'Wenn ich nur 10 Minuten habe — was tue ich gegen die Müdigkeit?',
      it: 'Se ho solo 10 minuti, cosa faccio per allentare la fatica?',
      es: 'Si solo tengo 10 minutos, ¿qué hago para aliviar la fatiga?',
      pt: 'Se só tenho 10 minutos, o que faço para aliviar o cansaço?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['quick', 'recovery'],
    rotationPriority: 1,
  },
  {
    id: 'face_fatigue_tonight_3_actions',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'high',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Donne-moi 3 actions ce soir pour me réveiller plus clair demain.',
      en: 'Give me 3 actions tonight so I wake up clearer tomorrow.',
      de: 'Gib mir 3 Aktionen für heute Abend, damit ich morgen klarer aufwache.',
      it: 'Dammi 3 azioni stasera per svegliarmi più lucido domani.',
      es: 'Dame 3 acciones esta noche para despertar más despejado mañana.',
      pt: 'Dá-me 3 ações esta noite para acordar mais lúcido amanhã.',
    }),
    presetRouteKeyFree: 'recovery_plan__today_after_bad_night',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['quick', 'recovery'],
    rotationPriority: 2,
  },
  {
    id: 'face_fatigue_48h_recovery',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel mini-plan 48h pour rattraper ma fatigue sans excès ?',
      en: 'What 48-hour mini-plan helps me recover without overdoing it?',
      de: 'Welchen 48-Stunden-Miniplan kann ich befolgen, um ohne Übertreibung zu erholen?',
      it: 'Quale mini-piano in 48 ore per recuperare senza esagerare?',
      es: '¿Qué mini-plan de 48 h me ayuda a recuperarme sin pasarme?',
      pt: 'Qual mini-plano de 48h me ajuda a recuperar sem exageros?',
    }),
    presetRouteKeyFree: 'recovery_plan__today_after_bad_night',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['recovery', 'plan'],
    rotationPriority: 3,
  },
  {
    id: 'face_fatigue_today_anchor',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'medium',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel ancrage matinal pour tenir mon énergie aujourd’hui ?',
      en: 'What morning anchor will hold my energy through today?',
      de: 'Welcher Morgenanker hält meine Energie heute aufrecht?',
      it: 'Quale ancoraggio mattutino mi tiene l’energia oggi?',
      es: '¿Qué ancla matinal me mantiene la energía hoy?',
      pt: 'Que âncora matinal segura a minha energia hoje?',
    }),
    presetRouteKeyFree: 'hydration_focus__morning_anchor_glass',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['quick', 'starter'],
    rotationPriority: 4,
  },
  {
    id: 'face_fatigue_week_rhythm',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'medium',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours pour remonter mon énergie sans tout chambouler.',
      en: '5-day plan to lift my energy without overhauling everything.',
      de: '5-Tage-Plan, um meine Energie zu steigern, ohne alles umzukrempeln.',
      it: 'Piano di 5 giorni per recuperare energia senza stravolgere tutto.',
      es: 'Plan de 5 días para subir la energía sin darle la vuelta a todo.',
      pt: 'Plano de 5 dias para subir a energia sem virar tudo de cabeça para baixo.',
    }),
    presetRouteKeyFree: 'recovery_plan__two_day_recovery_rhythm',
    presetRouteKeyPremium: 'body_focus__move_better_less_fatigue',
    tags: ['plan'],
    rotationPriority: 5,
  },
  {
    id: 'face_fatigue_evening_unwind',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'low',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel rituel doux ce soir pour relâcher sans casser mon sommeil ?',
      en: 'What gentle ritual tonight unwinds me without breaking sleep?',
      de: 'Welches sanfte Ritual heute Abend entspannt mich, ohne den Schlaf zu stören?',
      it: 'Quale rituale dolce stasera mi rilassa senza compromettere il sonno?',
      es: '¿Qué ritual suave esta noche me relaja sin romper el sueño?',
      pt: 'Que ritual leve esta noite me relaxa sem prejudicar o sono?',
    }),
    presetRouteKeyFree: 'sleep_coach__best_evening_routine',
    presetRouteKeyPremium: 'sleep_coach__protect_sleep_from_afternoon',
    tags: ['quick', 'recovery'],
    rotationPriority: 6,
  },
  {
    id: 'face_fatigue_today_3_actions',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples d’ici midi pour tenir mon énergie ?',
      en: '3 simple actions before noon to hold my energy?',
      de: '3 einfache Aktionen vor 12 Uhr, um meine Energie zu halten?',
      it: '3 azioni semplici prima di mezzogiorno per mantenere l’energia?',
      es: '¿3 acciones simples antes del mediodía para mantener la energía?',
      pt: '3 ações simples até ao meio-dia para manter a energia?',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['quick', 'starter'],
    rotationPriority: 7,
  },
  {
    id: 'face_fatigue_protect_sleep',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'high',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'afternoon',
    questions: fr_en_de_it_es_pt({
      fr: 'Que couper dès maintenant pour protéger mon sommeil de ce soir ?',
      en: 'What should I cut right now to protect tonight’s sleep?',
      de: 'Was sollte ich jetzt streichen, um den Schlaf heute Abend zu schützen?',
      it: 'Cosa eliminare adesso per proteggere il sonno di stasera?',
      es: '¿Qué cortar ahora mismo para proteger el sueño de esta noche?',
      pt: 'O que cortar agora para proteger o sono desta noite?',
    }),
    presetRouteKeyFree: 'recovery_plan__what_to_pause_for_recovery',
    presetRouteKeyPremium: 'sleep_coach__protect_sleep_from_afternoon',
    tags: ['quick', 'recovery'],
    rotationPriority: 8,
  },
  {
    id: 'face_fatigue_tracking_signals',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'any',
    timeHorizon: 'ongoing',
    questions: fr_en_de_it_es_pt({
      fr: 'Quels signaux suivre cette semaine pour voir si je récupère ?',
      en: 'Which signals should I track this week to see if I’m recovering?',
      de: 'Welche Signale beobachte ich diese Woche, um meine Erholung zu prüfen?',
      it: 'Quali segnali seguire questa settimana per capire se sto recuperando?',
      es: '¿Qué señales seguir esta semana para ver si me recupero?',
      pt: 'Que sinais seguir esta semana para ver se estou a recuperar?',
    }),
    presetRouteKeyFree: 'sleep_coach__wake_up_clearer_tomorrow',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['tracking'],
    rotationPriority: 9,
  },
  {
    id: 'face_fatigue_starter_first_step',
    scanType: 'face',
    metricKey: 'fatigue_level',
    severity: 'low',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel premier geste simple pour recharger un peu maintenant ?',
      en: 'What single simple move can I do right now to recharge a bit?',
      de: 'Welche einfache Handlung kann ich jetzt sofort tun, um aufzutanken?',
      it: 'Quale gesto semplice posso fare adesso per ricaricare un po’?',
      es: '¿Qué gesto simple puedo hacer ahora mismo para recargar un poco?',
      pt: 'Que gesto simples posso fazer agora para recarregar um pouco?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'sleep_coach__best_evening_routine',
    tags: ['quick', 'starter'],
    rotationPriority: 10,
  },

  // ─── FACE • skin_clarity_score ──────────────────────────────────────────
  {
    id: 'face_skin_clarity_tonight_simple',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'any',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel premier geste ce soir pour une peau plus nette demain ?',
      en: 'What first move tonight gives me clearer skin tomorrow?',
      de: 'Welche erste Geste heute Abend für klarere Haut morgen?',
      it: 'Quale primo gesto stasera per una pelle più chiara domani?',
      es: '¿Qué primer gesto esta noche para una piel más clara mañana?',
      pt: 'Que primeiro gesto esta noite para uma pele mais clara amanhã?',
    }),
    presetRouteKeyFree: 'face_focus__evening_routine_recovery',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'face_skin_clarity_today_3_actions',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Donne-moi 3 actions simples aujourd’hui pour une peau plus nette.',
      en: 'Give me 3 simple actions today for clearer skin.',
      de: 'Nenn mir heute 3 einfache Aktionen für klarere Haut.',
      it: 'Dammi 3 azioni semplici oggi per una pelle più chiara.',
      es: 'Dame 3 acciones simples hoy para una piel más clara.',
      pt: 'Dá-me 3 ações simples hoje para uma pele mais clara.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },
  {
    id: 'face_skin_clarity_week_progress',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'high',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours pour progressivement améliorer la clarté de ma peau.',
      en: '5-day plan to progressively improve my skin clarity.',
      de: '5-Tage-Plan, um die Klarheit meiner Haut Schritt für Schritt zu verbessern.',
      it: 'Piano di 5 giorni per migliorare gradualmente la chiarezza della pelle.',
      es: 'Plan de 5 días para mejorar la claridad de mi piel poco a poco.',
      pt: 'Plano de 5 dias para melhorar gradualmente a clareza da minha pele.',
    }),
    presetRouteKeyFree: 'face_focus__improve_glow_simple',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['plan'],
    rotationPriority: 3,
  },
  {
    id: 'face_skin_clarity_avoid_today',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi éviter aujourd’hui pour ne pas brouiller ma peau ?',
      en: 'What should I avoid today so my skin doesn’t look muddy?',
      de: 'Was sollte ich heute vermeiden, damit meine Haut nicht stumpf wirkt?',
      it: 'Cosa evitare oggi per non offuscare la pelle?',
      es: '¿Qué evitar hoy para que mi piel no luzca apagada?',
      pt: 'O que evitar hoje para que a minha pele não fique baça?',
    }),
    presetRouteKeyFree: 'latest_scan__avoid_worse_today',
    presetRouteKeyPremium: 'face_focus__avoid_irritating_skincare',
    tags: ['quick', 'starter'],
    rotationPriority: 4,
  },
  {
    id: 'face_skin_clarity_morning_routine',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'low',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelle routine matin courte pour soutenir ma peau ?',
      en: 'What short morning routine supports my skin today?',
      de: 'Welche kurze Morgenroutine unterstützt meine Haut heute?',
      it: 'Quale routine mattutina breve sostiene la mia pelle oggi?',
      es: '¿Qué rutina corta de mañana cuida hoy mi piel?',
      pt: 'Que rotina curta de manhã cuida da minha pele hoje?',
    }),
    presetRouteKeyFree: 'face_focus__simple_morning_routine',
    presetRouteKeyPremium: 'face_focus__simple_morning_routine',
    tags: ['quick', 'starter'],
    rotationPriority: 5,
  },
  {
    id: 'face_skin_clarity_first_step_5m',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'En 5 minutes maintenant, que faire pour aider ma peau ?',
      en: 'In 5 minutes right now, what helps my skin?',
      de: 'Was hilft meiner Haut in den nächsten 5 Minuten?',
      it: 'In 5 minuti adesso, cosa aiuta la mia pelle?',
      es: 'En 5 minutos ahora, ¿qué le sienta bien a mi piel?',
      pt: 'Em 5 minutos agora, o que ajuda a minha pele?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'face_focus__simple_morning_routine',
    tags: ['quick'],
    rotationPriority: 6,
  },
  {
    id: 'face_skin_clarity_tracking',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'any',
    timeHorizon: 'ongoing',
    questions: fr_en_de_it_es_pt({
      fr: 'Quels signaux suivre cette semaine pour voir si ma peau évolue ?',
      en: 'Which signals do I track this week to see my skin shift?',
      de: 'Welche Zeichen verfolge ich diese Woche, um Hautveränderungen zu sehen?',
      it: 'Quali segnali seguire questa settimana per vedere se la pelle cambia?',
      es: '¿Qué señales seguir esta semana para notar cambios en mi piel?',
      pt: 'Que sinais seguir esta semana para notar mudanças na minha pele?',
    }),
    presetRouteKeyFree: 'face_focus__habits_for_tired_look',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['tracking'],
    rotationPriority: 7,
  },
  {
    id: 'face_skin_clarity_48h_reset',
    scanType: 'face',
    metricKey: 'skin_clarity_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Mini-plan 48h pour calmer ma peau et la rendre plus nette ?',
      en: '48-hour mini-plan to calm and clarify my skin?',
      de: '48-Stunden-Miniplan, um meine Haut zu beruhigen und klarer zu machen?',
      it: 'Mini-piano in 48 ore per calmare e rendere più chiara la pelle?',
      es: '¿Mini-plan de 48 h para calmar y aclarar mi piel?',
      pt: 'Mini-plano de 48h para acalmar e clarear a minha pele?',
    }),
    presetRouteKeyFree: 'face_focus__avoid_irritating_skincare',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['recovery', 'plan'],
    rotationPriority: 8,
  },

  // ─── FACE • skin_evenness_score ─────────────────────────────────────────
  {
    id: 'face_skin_evenness_tonight_first',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'any',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel premier geste ce soir pour un teint plus uniforme demain ?',
      en: 'What first move tonight for a more even tone tomorrow?',
      de: 'Welcher erste Schritt heute Abend für einen ebenmäßigeren Teint?',
      it: 'Quale primo gesto stasera per un incarnato più uniforme domani?',
      es: '¿Qué primer gesto esta noche para un tono más uniforme mañana?',
      pt: 'Que primeiro gesto esta noite para um tom mais uniforme amanhã?',
    }),
    presetRouteKeyFree: 'face_focus__evening_routine_recovery',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'face_skin_evenness_avoid_today',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi éviter aujourd’hui pour ne pas marquer mes irrégularités ?',
      en: 'What should I avoid today so unevenness doesn’t stand out?',
      de: 'Was sollte ich heute vermeiden, damit Ungleichmäßigkeiten nicht auffallen?',
      it: 'Cosa evitare oggi per non far risaltare le irregolarità?',
      es: '¿Qué evitar hoy para que las irregularidades no se noten?',
      pt: 'O que evitar hoje para que as irregularidades não fiquem visíveis?',
    }),
    presetRouteKeyFree: 'face_focus__avoid_irritating_skincare',
    presetRouteKeyPremium: 'face_focus__avoid_irritating_skincare',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'face_skin_evenness_week_progress',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'high',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours pour progresser doucement sur l’uniformité du teint.',
      en: '5-day plan to gently progress on tone uniformity.',
      de: '5-Tage-Plan, um sanft an einem ebenmäßigen Teint zu arbeiten.',
      it: 'Piano di 5 giorni per migliorare con calma l’uniformità del tono.',
      es: 'Plan de 5 días para progresar suavemente en la uniformidad del tono.',
      pt: 'Plano de 5 dias para progredir devagar na uniformidade do tom.',
    }),
    presetRouteKeyFree: 'face_focus__improve_glow_simple',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['plan'],
    rotationPriority: 3,
  },
  {
    id: 'face_skin_evenness_today_3_actions',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 gestes simples aujourd’hui pour un teint plus harmonieux.',
      en: '3 simple moves today for a more even-looking tone.',
      de: '3 einfache Schritte heute für einen harmonischeren Teint.',
      it: '3 gesti semplici oggi per un incarnato più armonioso.',
      es: '3 gestos simples hoy para un tono más armonioso.',
      pt: '3 gestos simples hoje para um tom mais harmonioso.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['quick', 'starter'],
    rotationPriority: 4,
  },
  {
    id: 'face_skin_evenness_morning_anchor',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'low',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel ancrage matin court pour un teint plus uniforme ?',
      en: 'What short morning anchor helps even out my tone?',
      de: 'Welcher kurze Morgenanker hilft meinem Teint zu balancieren?',
      it: 'Quale ancora mattutina breve mi aiuta a uniformare il tono?',
      es: '¿Qué ancla matinal corta empareja mi tono?',
      pt: 'Que âncora matinal curta ajuda a equilibrar o meu tom?',
    }),
    presetRouteKeyFree: 'face_focus__simple_morning_routine',
    presetRouteKeyPremium: 'face_focus__simple_morning_routine',
    tags: ['quick'],
    rotationPriority: 5,
  },
  {
    id: 'face_skin_evenness_48h_reset',
    scanType: 'face',
    metricKey: 'skin_evenness_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Mini-plan 48h pour calmer les zones irrégulières sans agresser.',
      en: '48-hour mini-plan to calm uneven spots without irritation.',
      de: '48-Stunden-Miniplan, um ungleichmäßige Stellen sanft zu beruhigen.',
      it: 'Mini-piano in 48 ore per calmare le zone irregolari senza irritare.',
      es: 'Mini-plan de 48 h para calmar zonas irregulares sin irritar.',
      pt: 'Mini-plano de 48h para acalmar zonas irregulares sem irritar.',
    }),
    presetRouteKeyFree: 'face_focus__avoid_irritating_skincare',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['recovery', 'plan'],
    rotationPriority: 6,
  },

  // ─── FACE • under_eye_shadow_score ──────────────────────────────────────
  {
    id: 'face_under_eye_tonight_first',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'any',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel premier geste ce soir pour réveiller mon regard demain ?',
      en: 'What single move tonight will brighten my eyes tomorrow?',
      de: 'Welcher Schritt heute Abend lässt meinen Blick morgen wacher wirken?',
      it: 'Quale gesto stasera per uno sguardo più sveglio domani?',
      es: '¿Qué gesto esta noche para una mirada más despierta mañana?',
      pt: 'Que gesto esta noite para um olhar mais desperto amanhã?',
    }),
    presetRouteKeyFree: 'face_focus__evening_routine_recovery',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['quick', 'recovery'],
    rotationPriority: 1,
  },
  {
    id: 'face_under_eye_10min_morning',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'any',
    timeHorizon: 'now_5m',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: '10 minutes ce matin pour avoir l’air moins fatigué : par où je commence ?',
      en: '10 minutes this morning to look less tired — where do I start?',
      de: '10 Minuten heute Morgen, um weniger müde auszusehen — wo fange ich an?',
      it: '10 minuti stamattina per sembrare meno stanco: da dove inizio?',
      es: '10 minutos esta mañana para verme menos cansado: ¿por dónde empiezo?',
      pt: '10 minutos esta manhã para parecer menos cansado — por onde começo?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'face_focus__habits_for_tired_look',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'face_under_eye_avoid_today',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi limiter aujourd’hui pour ne pas creuser mes cernes ?',
      en: 'What should I limit today so my dark circles don’t deepen?',
      de: 'Was sollte ich heute reduzieren, damit meine Augenringe nicht stärker werden?',
      it: 'Cosa limitare oggi per non accentuare le occhiaie?',
      es: '¿Qué limitar hoy para no marcar más mis ojeras?',
      pt: 'O que limitar hoje para as olheiras não se acentuarem?',
    }),
    presetRouteKeyFree: 'face_focus__avoid_irritating_skincare',
    presetRouteKeyPremium: 'face_focus__habits_for_tired_look',
    tags: ['quick'],
    rotationPriority: 3,
  },
  {
    id: 'face_under_eye_48h_recovery',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 48h pour défatiguer mon regard sans sur-stimuler ma peau.',
      en: '48-hour plan to brighten my eyes without over-stimulating the skin.',
      de: '48-Stunden-Plan, um meinen Blick zu erfrischen, ohne die Haut zu reizen.',
      it: 'Piano in 48 ore per ravvivare lo sguardo senza stressare la pelle.',
      es: 'Plan de 48 h para refrescar mi mirada sin sobreestimular la piel.',
      pt: 'Plano de 48h para iluminar o olhar sem irritar a pele.',
    }),
    presetRouteKeyFree: 'face_focus__habits_for_tired_look',
    presetRouteKeyPremium: 'sleep_coach__wake_up_clearer_tomorrow',
    tags: ['recovery', 'plan'],
    rotationPriority: 4,
  },
  {
    id: 'face_under_eye_week_habits',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'medium',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelles habitudes simples cette semaine pour atténuer mes cernes ?',
      en: 'Which simple habits this week help soften my dark circles?',
      de: 'Welche einfachen Gewohnheiten diese Woche mildern meine Augenringe?',
      it: 'Quali abitudini semplici questa settimana attenuano le occhiaie?',
      es: '¿Qué hábitos simples esta semana suavizan mis ojeras?',
      pt: 'Que hábitos simples esta semana suavizam as olheiras?',
    }),
    presetRouteKeyFree: 'face_focus__habits_for_tired_look',
    presetRouteKeyPremium: 'face_focus__habits_for_tired_look',
    tags: ['plan'],
    rotationPriority: 5,
  },
  {
    id: 'face_under_eye_today_3_actions',
    scanType: 'face',
    metricKey: 'under_eye_shadow_score',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples aujourd’hui pour un regard plus frais.',
      en: '3 simple actions today for fresher-looking eyes.',
      de: '3 einfache Aktionen heute für einen frischeren Blick.',
      it: '3 azioni semplici oggi per uno sguardo più fresco.',
      es: '3 acciones simples hoy para una mirada más fresca.',
      pt: '3 ações simples hoje para um olhar mais fresco.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'face_focus__habits_for_tired_look',
    tags: ['quick'],
    rotationPriority: 6,
  },

  // ─── FACE • hydration_level ─────────────────────────────────────────────
  {
    id: 'face_hydration_now_5m_glass',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'Si je n’ai que 5 minutes pour m’hydrater, je fais quoi ?',
      en: 'If I only have 5 minutes to hydrate, what do I do?',
      de: 'Wenn ich nur 5 Minuten zum Trinken habe — was tue ich?',
      it: 'Se ho solo 5 minuti per idratarmi, cosa faccio?',
      es: 'Si solo tengo 5 minutos para hidratarme, ¿qué hago?',
      pt: 'Se só tenho 5 minutos para me hidratar, o que faço?',
    }),
    presetRouteKeyFree: 'hydration_focus__morning_anchor_glass',
    presetRouteKeyPremium: 'hydration_focus__easy_daily_hydration',
    tags: ['quick'],
    rotationPriority: 1,
  },
  {
    id: 'face_hydration_today_rhythm',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel rythme simple pour bien m’hydrater aujourd’hui sans y penser ?',
      en: 'What simple rhythm hydrates me today without thinking about it?',
      de: 'Welcher einfache Rhythmus hydriert mich heute, ohne dass ich nachdenken muss?',
      it: 'Quale ritmo semplice mi idrata oggi senza doverci pensare?',
      es: '¿Qué ritmo simple me hidrata hoy sin tener que pensarlo?',
      pt: 'Que ritmo simples me hidrata hoje sem ter que pensar?',
    }),
    presetRouteKeyFree: 'hydration_focus__easy_daily_hydration',
    presetRouteKeyPremium: 'hydration_focus__easy_daily_hydration',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },
  {
    id: 'face_hydration_active_day',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'high',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Comment m’hydrater pour une journée active sans m’alourdir ?',
      en: 'How do I hydrate for an active day without feeling heavy?',
      de: 'Wie hydriere ich mich an einem aktiven Tag, ohne mich aufgebläht zu fühlen?',
      it: 'Come mi idrato in una giornata attiva senza appesantirmi?',
      es: '¿Cómo me hidrato para un día activo sin sentirme pesado?',
      pt: 'Como me hidrato num dia ativo sem ficar pesado?',
    }),
    presetRouteKeyFree: 'hydration_focus__active_day_hydration',
    presetRouteKeyPremium: 'hydration_focus__active_day_hydration',
    tags: ['plan'],
    rotationPriority: 3,
  },
  {
    id: 'face_hydration_evening_recover',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'high',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Comment réhydrater ce soir après une journée trop sèche ?',
      en: 'How do I rehydrate tonight after a day that was too dry?',
      de: 'Wie hole ich heute Abend Flüssigkeit nach einem zu trockenen Tag nach?',
      it: 'Come mi reidrato stasera dopo una giornata troppo secca?',
      es: '¿Cómo me rehidrato esta noche tras un día demasiado seco?',
      pt: 'Como me reidrato esta noite após um dia demasiado seco?',
    }),
    presetRouteKeyFree: 'hydration_focus__rehydrate_tonight',
    presetRouteKeyPremium: 'hydration_focus__rehydrate_tonight',
    tags: ['recovery'],
    rotationPriority: 4,
  },
  {
    id: 'face_hydration_morning_anchor',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'any',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Un verre d’ancrage au réveil : comment je l’installe simplement ?',
      en: 'An anchor glass at wake-up — how do I install it simply?',
      de: 'Ein Ankerglas am Morgen — wie integriere ich das einfach?',
      it: 'Un bicchiere ancorante al risveglio — come lo introduco?',
      es: 'Un vaso ancla al despertar — ¿cómo lo instalo de forma sencilla?',
      pt: 'Um copo âncora ao acordar — como instalo de forma simples?',
    }),
    presetRouteKeyFree: 'hydration_focus__morning_anchor_glass',
    presetRouteKeyPremium: 'hydration_focus__morning_anchor_glass',
    tags: ['starter', 'tracking'],
    rotationPriority: 5,
  },
  {
    id: 'face_hydration_signals_track',
    scanType: 'face',
    metricKey: 'hydration_level',
    severity: 'any',
    timeHorizon: 'ongoing',
    questions: fr_en_de_it_es_pt({
      fr: 'Quels signaux suivre pour voir si je suis bien hydraté ?',
      en: 'Which signals do I track to see if I’m well hydrated?',
      de: 'Welche Zeichen verfolge ich, um zu sehen, ob ich gut hydriert bin?',
      it: 'Quali segnali seguire per capire se sono ben idratato?',
      es: '¿Qué señales seguir para saber si estoy bien hidratado?',
      pt: 'Que sinais seguir para saber se estou bem hidratado?',
    }),
    presetRouteKeyFree: 'hydration_focus__hydration_signals',
    presetRouteKeyPremium: 'hydration_focus__hydration_signals',
    tags: ['tracking'],
    rotationPriority: 6,
  },

  // ─── BODY • recovery_readiness_score ────────────────────────────────────
  {
    id: 'body_recovery_now_10min',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'Si j’ai 10 minutes, quelle mini-routine pour récupérer maintenant ?',
      en: 'If I have 10 minutes, what mini-routine helps me recover now?',
      de: 'Wenn ich 10 Minuten habe — welche Miniroutine hilft mir jetzt zu erholen?',
      it: 'Se ho 10 minuti, quale mini-routine mi aiuta a recuperare adesso?',
      es: 'Si tengo 10 minutos, ¿qué mini-rutina me ayuda a recuperar ahora?',
      pt: 'Se tenho 10 minutos, que mini-rotina ajuda a recuperar agora?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'body_focus__move_better_less_fatigue',
    tags: ['quick', 'recovery'],
    rotationPriority: 1,
  },
  {
    id: 'body_recovery_tonight_protocol',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'high',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel protocole simple ce soir pour vraiment récupérer cette nuit ?',
      en: 'What simple protocol tonight will truly help me recover overnight?',
      de: 'Welches einfache Protokoll heute Abend hilft mir, über Nacht zu erholen?',
      it: 'Quale protocollo semplice stasera mi aiuta a recuperare davvero stanotte?',
      es: '¿Qué protocolo simple esta noche me ayuda a recuperar de verdad?',
      pt: 'Que protocolo simples esta noite me ajuda a recuperar mesmo?',
    }),
    presetRouteKeyFree: 'recovery_plan__today_after_bad_night',
    presetRouteKeyPremium: 'sleep_coach__pre_big_day_bed_protocol',
    tags: ['recovery', 'plan'],
    rotationPriority: 2,
  },
  {
    id: 'body_recovery_48h_rhythm',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel rythme 48h pour vraiment relancer ma récupération ?',
      en: 'What 48-hour rhythm truly restarts my recovery?',
      de: 'Welcher 48-Stunden-Rhythmus startet meine Erholung wirklich neu?',
      it: 'Quale ritmo in 48 ore rimette davvero in moto il recupero?',
      es: '¿Qué ritmo de 48 h reactiva de verdad mi recuperación?',
      pt: 'Que ritmo de 48h relança mesmo a minha recuperação?',
    }),
    presetRouteKeyFree: 'recovery_plan__two_day_recovery_rhythm',
    presetRouteKeyPremium: 'body_focus__move_better_less_fatigue',
    tags: ['recovery', 'plan'],
    rotationPriority: 3,
  },
  {
    id: 'body_recovery_today_pause',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Que mettre en pause aujourd’hui pour mieux récupérer ?',
      en: 'What should I pause today so I recover better?',
      de: 'Was sollte ich heute pausieren, um besser zu regenerieren?',
      it: 'Cosa metto in pausa oggi per recuperare meglio?',
      es: '¿Qué pongo en pausa hoy para recuperar mejor?',
      pt: 'O que pauso hoje para recuperar melhor?',
    }),
    presetRouteKeyFree: 'recovery_plan__what_to_pause_for_recovery',
    presetRouteKeyPremium: 'recovery_plan__what_to_pause_for_recovery',
    tags: ['quick', 'recovery'],
    rotationPriority: 4,
  },
  {
    id: 'body_recovery_week_progressive',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'medium',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours pour reprendre du jus sans surcharger.',
      en: '5-day plan to regain juice without overloading myself.',
      de: '5-Tage-Plan, um Energie zurückzugewinnen, ohne mich zu überladen.',
      it: 'Piano di 5 giorni per recuperare energia senza sovraccaricarmi.',
      es: 'Plan de 5 días para recuperar chispa sin sobrecargarme.',
      pt: 'Plano de 5 dias para recuperar energia sem sobrecarregar.',
    }),
    presetRouteKeyFree: 'recovery_plan__two_day_recovery_rhythm',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['plan'],
    rotationPriority: 5,
  },
  {
    id: 'body_recovery_today_3_actions',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 gestes simples d’ici ce soir pour mieux récupérer.',
      en: '3 simple moves by tonight to recover better.',
      de: '3 einfache Schritte bis heute Abend, um besser zu erholen.',
      it: '3 gesti semplici entro stasera per recuperare meglio.',
      es: '3 gestos simples de aquí a esta noche para recuperar mejor.',
      pt: '3 gestos simples até à noite para recuperar melhor.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'body_focus__short_session_low_energy',
    tags: ['quick', 'recovery'],
    rotationPriority: 6,
  },
  {
    id: 'body_recovery_starter_low_energy',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'low',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Une mini-séance basse intensité pour rebouger sans me casser.',
      en: 'A low-intensity mini-session to move again without breaking me.',
      de: 'Eine kurze Einheit mit niedriger Intensität, um wieder in Bewegung zu kommen.',
      it: 'Una mini-sessione a bassa intensità per rimettermi in moto senza forzare.',
      es: 'Una mini-sesión de baja intensidad para volver a moverme sin pasarme.',
      pt: 'Uma mini-sessão de baixa intensidade para voltar a mexer-me sem forçar.',
    }),
    presetRouteKeyFree: 'body_focus__short_session_low_energy',
    presetRouteKeyPremium: 'body_focus__short_session_low_energy',
    tags: ['starter'],
    rotationPriority: 7,
  },
  {
    id: 'body_recovery_signals_track',
    scanType: 'body',
    metricKey: 'recovery_readiness_score',
    severity: 'any',
    timeHorizon: 'ongoing',
    questions: fr_en_de_it_es_pt({
      fr: 'Quels signaux suivre pour voir si ma récup remonte ?',
      en: 'Which signals do I track to see my recovery climbing back?',
      de: 'Welche Signale beobachte ich, um zu sehen, dass meine Erholung steigt?',
      it: 'Quali segnali seguire per vedere se il recupero risale?',
      es: '¿Qué señales seguir para ver si mi recuperación remonta?',
      pt: 'Que sinais seguir para ver se a minha recuperação está a subir?',
    }),
    presetRouteKeyFree: 'sleep_coach__wake_up_clearer_tomorrow',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['tracking'],
    rotationPriority: 8,
  },

  // ─── BODY • posture_score ───────────────────────────────────────────────
  {
    id: 'body_posture_now_10min',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'En 10 minutes maintenant, je fais quoi pour relâcher ma posture ?',
      en: 'In 10 minutes right now, what releases my posture?',
      de: 'In 10 Minuten jetzt — was hilft mir, meine Haltung zu lockern?',
      it: 'In 10 minuti adesso, cosa faccio per rilassare la postura?',
      es: 'En 10 minutos ahora, ¿qué hago para soltar la postura?',
      pt: 'Em 10 minutos agora, o que faço para soltar a postura?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['quick'],
    rotationPriority: 1,
  },
  {
    id: 'body_posture_today_3_actions',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Donne-moi 3 micro-actions posture à caser dans ma journée.',
      en: 'Give me 3 micro-actions for posture I can slot into my day.',
      de: 'Gib mir 3 Mikro-Aktionen für die Haltung, die in meinen Tag passen.',
      it: 'Dammi 3 micro-azioni per la postura da inserire nella giornata.',
      es: 'Dame 3 micro-acciones de postura para meter en mi día.',
      pt: 'Dá-me 3 micro-ações de postura para encaixar no meu dia.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },
  {
    id: 'body_posture_tonight_unwind',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'medium',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelle mini-routine ce soir pour relâcher la tension dans le dos ?',
      en: 'What mini-routine tonight releases my back tension?',
      de: 'Welche Miniroutine heute Abend löst die Spannung in meinem Rücken?',
      it: 'Quale mini-routine stasera scarica la tensione nella schiena?',
      es: '¿Qué mini-rutina esta noche libera la tensión de la espalda?',
      pt: 'Que mini-rotina esta noite alivia a tensão das costas?',
    }),
    presetRouteKeyFree: 'recovery_plan__what_to_pause_for_recovery',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['quick', 'recovery'],
    rotationPriority: 3,
  },
  {
    id: 'body_posture_48h_reset',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Mini-plan 48h pour redresser ma posture sans forcer.',
      en: '48-hour mini-plan to straighten my posture without pushing too hard.',
      de: '48-Stunden-Miniplan, um meine Haltung sanft aufzurichten.',
      it: 'Mini-piano in 48 ore per raddrizzare la postura senza forzare.',
      es: 'Mini-plan de 48 h para enderezar la postura sin forzar.',
      pt: 'Mini-plano de 48h para endireitar a postura sem forçar.',
    }),
    presetRouteKeyFree: 'body_focus__short_session_low_energy',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['recovery', 'plan'],
    rotationPriority: 4,
  },
  {
    id: 'body_posture_week_progress',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'high',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours posture/mobilité réaliste, sans matériel.',
      en: '5-day realistic posture and mobility plan — no equipment.',
      de: '5-Tage-Plan für Haltung und Beweglichkeit — ohne Equipment.',
      it: 'Piano di 5 giorni postura e mobilità, senza attrezzi.',
      es: 'Plan de 5 días postura y movilidad realista, sin equipo.',
      pt: 'Plano de 5 dias postura e mobilidade, sem equipamento.',
    }),
    presetRouteKeyFree: 'body_focus__weekly_mini_plan',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['plan'],
    rotationPriority: 5,
  },
  {
    id: 'body_posture_starter_small_step',
    scanType: 'body',
    metricKey: 'posture_score',
    severity: 'low',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Premier réflexe simple à intégrer pour soutenir ma posture aujourd’hui.',
      en: 'One simple reflex to support my posture today.',
      de: 'Ein einfacher Reflex, um meine Haltung heute zu stützen.',
      it: 'Un riflesso semplice per sostenere la mia postura oggi.',
      es: 'Un reflejo simple para apoyar mi postura hoy.',
      pt: 'Um reflexo simples para apoiar a minha postura hoje.',
    }),
    presetRouteKeyFree: 'body_focus__short_session_low_energy',
    presetRouteKeyPremium: 'body_focus__mobility_posture_priorities',
    tags: ['starter'],
    rotationPriority: 6,
  },

  // ─── BODY • body_fat_percentage ─────────────────────────────────────────
  {
    id: 'body_bodyfat_today_3_actions',
    scanType: 'body',
    metricKey: 'body_fat_percentage',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples aujourd’hui pour repartir du bon pied côté composition.',
      en: '3 simple actions today to restart on a good footing for composition.',
      de: '3 einfache Aktionen heute, um beim Körperfett gut zu starten.',
      it: '3 azioni semplici oggi per ripartire bene sulla composizione.',
      es: '3 acciones simples hoy para reencauzar la composición.',
      pt: '3 ações simples hoje para retomar bem a composição.',
    }),
    presetRouteKeyFree: 'recovery_plan__simple_restart_after_excess',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'body_bodyfat_48h_reset',
    scanType: 'body',
    metricKey: 'body_fat_percentage',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Reset doux 48h pour repartir sans frustration ?',
      en: 'Gentle 48-hour reset to start over without frustration?',
      de: 'Sanfter 48-Stunden-Reset, um ohne Frust neu zu starten?',
      it: 'Reset dolce in 48 ore per ripartire senza frustrazione?',
      es: '¿Reset suave de 48 h para retomar sin frustración?',
      pt: 'Reset suave em 48h para recomeçar sem frustração?',
    }),
    presetRouteKeyFree: 'recovery_plan__simple_restart_after_excess',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['recovery', 'plan'],
    rotationPriority: 2,
  },
  {
    id: 'body_bodyfat_week_realistic',
    scanType: 'body',
    metricKey: 'body_fat_percentage',
    severity: 'medium',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours réaliste pour bouger ma composition petit à petit.',
      en: 'Realistic 5-day plan to shift my composition step by step.',
      de: 'Realistischer 5-Tage-Plan, um meine Komposition Schritt für Schritt zu ändern.',
      it: 'Piano realistico di 5 giorni per cambiare composizione poco a poco.',
      es: 'Plan realista de 5 días para mover mi composición poco a poco.',
      pt: 'Plano realista de 5 dias para mexer na composição aos poucos.',
    }),
    presetRouteKeyFree: 'body_focus__weekly_mini_plan',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['plan'],
    rotationPriority: 3,
  },
  {
    id: 'body_bodyfat_today_protect',
    scanType: 'body',
    metricKey: 'body_fat_percentage',
    severity: 'high',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi éviter aujourd’hui pour ne pas saboter le prochain scan ?',
      en: 'What should I avoid today so I don’t sabotage the next scan?',
      de: 'Was sollte ich heute vermeiden, um den nächsten Scan nicht zu sabotieren?',
      it: 'Cosa evitare oggi per non sabotare la prossima scansione?',
      es: '¿Qué evitar hoy para no sabotear el próximo escaneo?',
      pt: 'O que evitar hoje para não sabotar o próximo scan?',
    }),
    presetRouteKeyFree: 'latest_scan__avoid_worse_today',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['quick'],
    rotationPriority: 4,
  },

  // ─── BODY • muscle_definition_score ─────────────────────────────────────
  {
    id: 'body_muscle_def_week_plan',
    scanType: 'body',
    metricKey: 'muscle_definition_score',
    severity: 'any',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours pour gagner en définition sans cramer mes séances.',
      en: '5-day plan to gain definition without burning my sessions.',
      de: '5-Tage-Plan für mehr Definition, ohne meine Trainings zu zerstören.',
      it: 'Piano di 5 giorni per migliorare la definizione senza bruciare le sessioni.',
      es: 'Plan de 5 días para ganar definición sin quemar mis sesiones.',
      pt: 'Plano de 5 dias para ganhar definição sem queimar os treinos.',
    }),
    presetRouteKeyFree: 'body_focus__weekly_mini_plan',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['plan'],
    rotationPriority: 1,
  },
  {
    id: 'body_muscle_def_today_3_actions',
    scanType: 'body',
    metricKey: 'muscle_definition_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples aujourd’hui pour soutenir ma définition.',
      en: '3 simple actions today to support my muscle definition.',
      de: '3 einfache Aktionen heute, um meine Definition zu unterstützen.',
      it: '3 azioni semplici oggi per sostenere la definizione.',
      es: '3 acciones simples hoy para apoyar mi definición.',
      pt: '3 ações simples hoje para apoiar a minha definição.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },
  {
    id: 'body_muscle_def_short_session',
    scanType: 'body',
    metricKey: 'muscle_definition_score',
    severity: 'low',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Mini-séance courte pour entretenir la définition même fatigué.',
      en: 'Short mini-session to keep definition even when tired.',
      de: 'Kurze Miniroutine, um die Definition zu halten — auch wenn ich müde bin.',
      it: 'Mini-sessione breve per mantenere la definizione anche stanco.',
      es: 'Mini-sesión corta para mantener la definición incluso cansado.',
      pt: 'Mini-sessão curta para manter a definição mesmo cansado.',
    }),
    presetRouteKeyFree: 'body_focus__short_session_low_energy',
    presetRouteKeyPremium: 'body_focus__short_session_low_energy',
    tags: ['quick'],
    rotationPriority: 3,
  },

  // ─── NUTRITION • meal_balance_score ─────────────────────────────────────
  {
    id: 'nut_meal_balance_next_meal',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel swap simple sur mon prochain repas pour mieux équilibrer ?',
      en: 'What simple swap on my next meal balances it better?',
      de: 'Welcher einfache Tausch macht meine nächste Mahlzeit ausgewogener?',
      it: 'Quale scambio semplice rende il prossimo pasto più equilibrato?',
      es: '¿Qué cambio simple en mi próxima comida la equilibra mejor?',
      pt: 'Que troca simples na próxima refeição equilibra melhor?',
    }),
    presetRouteKeyFree: 'nutrition_focus__simple_lunch_balance',
    presetRouteKeyPremium: 'nutrition_focus__simple_lunch_balance',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'nut_meal_balance_today_3_actions',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 ajouts simples d’ici ce soir pour équilibrer mes repas.',
      en: '3 simple additions by tonight to balance my meals.',
      de: '3 einfache Ergänzungen bis heute Abend, um meine Mahlzeiten auszubalancieren.',
      it: '3 aggiunte semplici entro stasera per equilibrare i pasti.',
      es: '3 incorporaciones simples de aquí a la noche para equilibrar comidas.',
      pt: '3 acréscimos simples até à noite para equilibrar refeições.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'nutrition_focus__simple_lunch_balance',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'nut_meal_balance_breakfast_no_crash',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel petit-déj équilibré pour éviter le coup de barre ?',
      en: 'What balanced breakfast prevents an energy crash?',
      de: 'Welches ausgewogene Frühstück verhindert das Energietief?',
      it: 'Quale colazione equilibrata evita il calo di energia?',
      es: '¿Qué desayuno equilibrado evita el bajón de energía?',
      pt: 'Que pequeno-almoço equilibrado evita o cansaço a meio da manhã?',
    }),
    presetRouteKeyFree: 'nutrition_focus__breakfast_no_crash',
    presetRouteKeyPremium: 'nutrition_focus__breakfast_no_crash',
    tags: ['quick', 'starter'],
    rotationPriority: 3,
  },
  {
    id: 'nut_meal_balance_dinner_light',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'low',
    timeHorizon: 'tonight_12h',
    preferredTimeOfDay: 'evening',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel dîner léger ce soir qui m’aide à bien dormir ?',
      en: 'What light dinner tonight helps me sleep well?',
      de: 'Welches leichte Abendessen heute Abend hilft mir, gut zu schlafen?',
      it: 'Quale cena leggera stasera mi aiuta a dormire bene?',
      es: '¿Qué cena ligera esta noche me ayuda a dormir bien?',
      pt: 'Que jantar leve esta noite me ajuda a dormir bem?',
    }),
    presetRouteKeyFree: 'nutrition_focus__light_recovery_dinner',
    presetRouteKeyPremium: 'nutrition_focus__light_recovery_dinner',
    tags: ['quick', 'recovery'],
    rotationPriority: 4,
  },
  {
    id: 'nut_meal_balance_week_swaps',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'high',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours de swaps malins pour des repas mieux équilibrés.',
      en: '5-day plan of smart swaps for better-balanced meals.',
      de: '5-Tage-Plan mit cleveren Tauschideen für ausgewogenere Mahlzeiten.',
      it: 'Piano di 5 giorni di scambi furbi per pasti più equilibrati.',
      es: 'Plan de 5 días de cambios inteligentes para comidas más equilibradas.',
      pt: 'Plano de 5 dias de trocas espertas para refeições mais equilibradas.',
    }),
    presetRouteKeyFree: 'nutrition_focus__smart_swaps_week',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['plan'],
    rotationPriority: 5,
  },
  {
    id: 'nut_meal_balance_avoid_today',
    scanType: 'nutrition',
    metricKey: 'meal_balance_score',
    severity: 'high',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi limiter aujourd’hui pour ne pas déséquilibrer mes prochains repas ?',
      en: 'What should I limit today so my next meals stay balanced?',
      de: 'Was sollte ich heute reduzieren, damit meine nächsten Mahlzeiten ausgewogen bleiben?',
      it: 'Cosa limitare oggi per non sbilanciare i prossimi pasti?',
      es: '¿Qué limitar hoy para que mis próximas comidas sigan equilibradas?',
      pt: 'O que limitar hoje para as próximas refeições continuarem equilibradas?',
    }),
    presetRouteKeyFree: 'latest_scan__avoid_worse_today',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['quick'],
    rotationPriority: 6,
  },

  // ─── NUTRITION • protein_grams ──────────────────────────────────────────
  {
    id: 'nut_protein_today_3_actions',
    scanType: 'nutrition',
    metricKey: 'protein_grams',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 ajouts simples d’ici ce soir pour atteindre mes protéines.',
      en: '3 simple additions by tonight to hit my protein target.',
      de: '3 einfache Ergänzungen bis heute Abend, um meine Protein-Ziele zu erreichen.',
      it: '3 aggiunte semplici entro stasera per arrivare alle proteine.',
      es: '3 incorporaciones simples de aquí a esta noche para alcanzar las proteínas.',
      pt: '3 acréscimos simples até à noite para atingir as proteínas.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'nutrition_focus__simple_lunch_balance',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'nut_protein_breakfast_steady',
    scanType: 'nutrition',
    metricKey: 'protein_grams',
    severity: 'medium',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel petit-déj rapide qui me cale en protéines dès le matin ?',
      en: 'What fast breakfast loads me up on protein from the morning?',
      de: 'Welches schnelle Frühstück liefert mir Protein direkt am Morgen?',
      it: 'Quale colazione veloce mi carica di proteine fin dal mattino?',
      es: '¿Qué desayuno rápido me carga de proteínas desde la mañana?',
      pt: 'Que pequeno-almoço rápido carrega-me logo de proteína?',
    }),
    presetRouteKeyFree: 'nutrition_focus__breakfast_no_crash',
    presetRouteKeyPremium: 'nutrition_focus__breakfast_no_crash',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },
  {
    id: 'nut_protein_lunch_balance',
    scanType: 'nutrition',
    metricKey: 'protein_grams',
    severity: 'high',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'midday',
    questions: fr_en_de_it_es_pt({
      fr: 'Un déjeuner simple pour rattraper mes protéines aujourd’hui ?',
      en: 'A simple lunch to catch up on my protein today?',
      de: 'Ein einfaches Mittagessen, um heute mein Protein nachzuholen?',
      it: 'Un pranzo semplice per recuperare le proteine oggi?',
      es: '¿Un almuerzo simple para recuperar mis proteínas hoy?',
      pt: 'Um almoço simples para recuperar as proteínas hoje?',
    }),
    presetRouteKeyFree: 'nutrition_focus__simple_lunch_balance',
    presetRouteKeyPremium: 'nutrition_focus__simple_lunch_balance',
    tags: ['quick'],
    rotationPriority: 3,
  },
  {
    id: 'nut_protein_shopping_3day',
    scanType: 'nutrition',
    metricKey: 'protein_grams',
    severity: 'medium',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Une mini-liste de courses 3 jours pour stabiliser mes protéines.',
      en: 'A mini 3-day grocery list to stabilise my protein intake.',
      de: 'Eine kleine 3-Tage-Einkaufsliste, um mein Protein stabil zu halten.',
      it: 'Una mini lista della spesa di 3 giorni per stabilizzare le proteine.',
      es: 'Una mini lista de compras de 3 días para estabilizar las proteínas.',
      pt: 'Uma mini lista de compras de 3 dias para estabilizar a proteína.',
    }),
    presetRouteKeyFree: 'nutrition_focus__minimal_three_day_shopping',
    presetRouteKeyPremium: 'nutrition_focus__minimal_three_day_shopping',
    tags: ['plan'],
    rotationPriority: 4,
  },

  // ─── NUTRITION • fiber_grams_estimate ───────────────────────────────────
  {
    id: 'nut_fiber_week_swaps',
    scanType: 'nutrition',
    metricKey: 'fiber_grams_estimate',
    severity: 'any',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours de swaps simples pour plus de fibres sans surprise.',
      en: '5-day plan of simple swaps for more fibre without surprises.',
      de: '5-Tage-Plan mit einfachen Tauschideen für mehr Ballaststoffe ohne Überraschungen.',
      it: 'Piano di 5 giorni di scambi semplici per più fibre senza sorprese.',
      es: 'Plan de 5 días de cambios simples para más fibra sin sorpresas.',
      pt: 'Plano de 5 dias de trocas simples para mais fibra sem surpresas.',
    }),
    presetRouteKeyFree: 'nutrition_focus__smart_swaps_week',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['plan'],
    rotationPriority: 1,
  },
  {
    id: 'nut_fiber_today_3_actions',
    scanType: 'nutrition',
    metricKey: 'fiber_grams_estimate',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 ajouts simples aujourd’hui pour plus de fibres dans mes repas.',
      en: '3 simple additions today for more fibre in my meals.',
      de: '3 einfache Ergänzungen heute für mehr Ballaststoffe in meinen Mahlzeiten.',
      it: '3 aggiunte semplici oggi per più fibre nei pasti.',
      es: '3 incorporaciones simples hoy para más fibra en mis comidas.',
      pt: '3 acréscimos simples hoje para mais fibra nas refeições.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['quick', 'starter'],
    rotationPriority: 2,
  },

  // ─── NUTRITION • sugar_grams_estimate ───────────────────────────────────
  {
    id: 'nut_sugar_avoid_today',
    scanType: 'nutrition',
    metricKey: 'sugar_grams_estimate',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quoi limiter aujourd’hui pour éviter les pics de sucre ?',
      en: 'What should I limit today to avoid sugar spikes?',
      de: 'Was sollte ich heute reduzieren, um Zuckerspitzen zu vermeiden?',
      it: 'Cosa limitare oggi per evitare i picchi di zucchero?',
      es: '¿Qué limitar hoy para evitar picos de azúcar?',
      pt: 'O que limitar hoje para evitar picos de açúcar?',
    }),
    presetRouteKeyFree: 'latest_scan__avoid_worse_today',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['quick'],
    rotationPriority: 1,
  },
  {
    id: 'nut_sugar_breakfast_no_crash',
    scanType: 'nutrition',
    metricKey: 'sugar_grams_estimate',
    severity: 'medium',
    timeHorizon: 'today_1h',
    preferredTimeOfDay: 'morning',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel petit-déj salé pour éviter le coup de barre du matin ?',
      en: 'What savoury breakfast prevents the late-morning crash?',
      de: 'Welches herzhafte Frühstück verhindert den späten Vormittagscrash?',
      it: 'Quale colazione salata evita il calo di metà mattinata?',
      es: '¿Qué desayuno salado evita el bajón de media mañana?',
      pt: 'Que pequeno-almoço salgado evita o cansaço a meio da manhã?',
    }),
    presetRouteKeyFree: 'nutrition_focus__breakfast_no_crash',
    presetRouteKeyPremium: 'nutrition_focus__breakfast_no_crash',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'nut_sugar_week_swaps',
    scanType: 'nutrition',
    metricKey: 'sugar_grams_estimate',
    severity: 'high',
    timeHorizon: 'week_5d',
    questions: fr_en_de_it_es_pt({
      fr: 'Plan 5 jours de swaps doux pour réduire mes sucres sans frustration.',
      en: '5-day plan of gentle swaps to cut sugar without frustration.',
      de: '5-Tage-Plan mit sanften Tauschideen, um Zucker frustfrei zu reduzieren.',
      it: 'Piano di 5 giorni di scambi dolci per ridurre lo zucchero senza frustrazione.',
      es: 'Plan de 5 días de cambios suaves para reducir azúcar sin frustración.',
      pt: 'Plano de 5 dias de trocas suaves para reduzir açúcar sem frustração.',
    }),
    presetRouteKeyFree: 'nutrition_focus__smart_swaps_week',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['plan'],
    rotationPriority: 3,
  },

  // ─── SUPER • global_risk_score ──────────────────────────────────────────
  {
    id: 'super_priority_today',
    scanType: 'super',
    metricKey: 'global_risk_score',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelle priorité n°1 traiter aujourd’hui après ce super scan ?',
      en: 'What is the number one priority to handle today after this super scan?',
      de: 'Welche Priorität Nummer eins gehe ich heute nach diesem Super-Scan an?',
      it: 'Quale priorità numero uno affrontare oggi dopo questo super scan?',
      es: '¿Cuál es la prioridad número uno a abordar hoy tras este super scan?',
      pt: 'Qual a prioridade número um para encarar hoje após este super scan?',
    }),
    presetRouteKeyFree: 'latest_scan__top_priority_today',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'super_10_minute_reset',
    scanType: 'super',
    metricKey: 'global_risk_score',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'En 10 minutes maintenant, par où je commence pour me sentir mieux ?',
      en: 'In 10 minutes right now, where do I start to feel better?',
      de: 'In 10 Minuten jetzt — wo fange ich an, um mich besser zu fühlen?',
      it: 'In 10 minuti adesso, da dove inizio per sentirmi meglio?',
      es: 'En 10 minutos ahora, ¿por dónde empiezo para sentirme mejor?',
      pt: 'Em 10 minutos agora, por onde começo para me sentir melhor?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'super_48h_calm_reset',
    scanType: 'super',
    metricKey: 'global_risk_score',
    severity: 'high',
    timeHorizon: '48h',
    questions: fr_en_de_it_es_pt({
      fr: 'Reset calme 48h pour revenir à l’équilibre étape par étape.',
      en: 'Calm 48-hour reset to come back to balance step by step.',
      de: 'Ruhiger 48-Stunden-Reset, um Schritt für Schritt zur Balance zurückzukehren.',
      it: 'Reset tranquillo in 48 ore per tornare in equilibrio passo dopo passo.',
      es: 'Reset tranquilo de 48 h para volver al equilibrio paso a paso.',
      pt: 'Reset calmo de 48h para voltar ao equilíbrio passo a passo.',
    }),
    presetRouteKeyFree: 'recovery_plan__simple_restart_after_excess',
    presetRouteKeyPremium: 'risk_watch__what_change_requires_faster_action',
    tags: ['recovery', 'plan'],
    rotationPriority: 3,
  },
  {
    id: 'super_today_3_actions',
    scanType: 'super',
    metricKey: 'global_risk_score',
    severity: 'medium',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples aujourd’hui pour calmer les signaux de ce super scan.',
      en: '3 simple actions today to calm the signals from this super scan.',
      de: '3 einfache Aktionen heute, um die Signale dieses Super-Scans zu beruhigen.',
      it: '3 azioni semplici oggi per calmare i segnali di questo super scan.',
      es: '3 acciones simples hoy para calmar las señales de este super scan.',
      pt: '3 ações simples hoje para acalmar os sinais deste super scan.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['quick'],
    rotationPriority: 4,
  },
  {
    id: 'super_tracking_week',
    scanType: 'super',
    metricKey: 'global_risk_score',
    severity: 'any',
    timeHorizon: 'ongoing',
    questions: fr_en_de_it_es_pt({
      fr: 'Quels signaux suivre cette semaine après ce super scan ?',
      en: 'Which signals should I monitor this week after this super scan?',
      de: 'Welche Signale beobachte ich diese Woche nach diesem Super-Scan?',
      it: 'Quali segnali seguire questa settimana dopo questo super scan?',
      es: '¿Qué señales seguir esta semana tras este super scan?',
      pt: 'Que sinais seguir esta semana após este super scan?',
    }),
    presetRouteKeyFree: 'sleep_coach__wake_up_clearer_tomorrow',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['tracking'],
    rotationPriority: 5,
  },

  // ─── WILDCARDS (fallback metric=*) ──────────────────────────────────────
  // Affichés si la métrique prioritaire n'a pas d'entrée dédiée pour ce
  // scanType. Toutes sévérités, rotation prudente.
  {
    id: 'face_wildcard_3_actions',
    scanType: 'face',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelles 3 actions simples d’ici ce soir ressortent de ce scan visage ?',
      en: 'Which 3 simple actions by tonight come out of this face scan?',
      de: 'Welche 3 einfachen Aktionen bis heute Abend ergeben sich aus diesem Gesichtsscan?',
      it: 'Quali 3 azioni semplici entro stasera emergono da questo scan viso?',
      es: '¿Qué 3 acciones simples hasta esta noche salen de este escaneo facial?',
      pt: 'Que 3 ações simples até à noite saem deste scan facial?',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'face_focus__improve_glow_simple',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'face_wildcard_10min_reset',
    scanType: 'face',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'En 10 minutes maintenant, par où je commence après ce scan visage ?',
      en: 'In 10 minutes right now, where do I start after this face scan?',
      de: 'In 10 Minuten jetzt — wo fange ich nach diesem Gesichtsscan an?',
      it: 'In 10 minuti adesso, da dove inizio dopo questo scan viso?',
      es: 'En 10 minutos ahora, ¿por dónde empiezo tras este escaneo facial?',
      pt: 'Em 10 minutos agora, por onde começo após este scan facial?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'face_focus__simple_morning_routine',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'body_wildcard_3_actions',
    scanType: 'body',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelles 3 actions simples d’ici ce soir ressortent de ce scan corps ?',
      en: 'Which 3 simple actions by tonight come out of this body scan?',
      de: 'Welche 3 einfachen Aktionen bis heute Abend ergeben sich aus diesem Körperscan?',
      it: 'Quali 3 azioni semplici entro stasera emergono da questo scan corpo?',
      es: '¿Qué 3 acciones simples hasta esta noche salen de este escaneo corporal?',
      pt: 'Que 3 ações simples até à noite saem deste scan corporal?',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'body_focus__weekly_mini_plan',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'body_wildcard_10min_reset',
    scanType: 'body',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'now_5m',
    questions: fr_en_de_it_es_pt({
      fr: 'En 10 minutes maintenant, quel mini-mouvement après ce scan corps ?',
      en: 'In 10 minutes right now, what mini-move after this body scan?',
      de: 'In 10 Minuten jetzt — welche kleine Bewegung nach diesem Körperscan?',
      it: 'In 10 minuti adesso, quale micro-movimento dopo questo scan corpo?',
      es: 'En 10 minutos ahora, ¿qué micro-movimiento tras este escaneo corporal?',
      pt: 'Em 10 minutos agora, que micro-movimento após este scan corporal?',
    }),
    presetRouteKeyFree: 'latest_scan__ten_minute_priority',
    presetRouteKeyPremium: 'body_focus__short_session_low_energy',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'nutrition_wildcard_next_meal',
    scanType: 'nutrition',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quel swap simple sur mon prochain repas après ce scan ?',
      en: 'What simple swap on my next meal after this scan?',
      de: 'Welcher einfache Tausch bei meiner nächsten Mahlzeit nach diesem Scan?',
      it: 'Quale scambio semplice nel prossimo pasto dopo questo scan?',
      es: '¿Qué cambio simple en mi próxima comida tras este escaneo?',
      pt: 'Que troca simples na próxima refeição após este scan?',
    }),
    presetRouteKeyFree: 'nutrition_focus__simple_lunch_balance',
    presetRouteKeyPremium: 'nutrition_focus__smart_swaps_week',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
  {
    id: 'nutrition_wildcard_3_actions',
    scanType: 'nutrition',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: 'Quelles 3 actions nutrition d’ici ce soir après ce scan ?',
      en: 'Which 3 nutrition actions by tonight after this scan?',
      de: 'Welche 3 Ernährungsaktionen bis heute Abend nach diesem Scan?',
      it: 'Quali 3 azioni nutrizionali entro stasera dopo questo scan?',
      es: '¿Qué 3 acciones de nutrición hasta esta noche tras este escaneo?',
      pt: 'Que 3 ações de nutrição até à noite após este scan?',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'nutrition_focus__simple_lunch_balance',
    tags: ['quick'],
    rotationPriority: 2,
  },
  {
    id: 'super_wildcard_3_actions',
    scanType: 'super',
    metricKey: '*',
    severity: 'any',
    timeHorizon: 'today_1h',
    questions: fr_en_de_it_es_pt({
      fr: '3 actions simples aujourd’hui pour bien rebondir après ce super scan.',
      en: '3 simple actions today to bounce back well after this super scan.',
      de: '3 einfache Aktionen heute, um nach diesem Super-Scan gut wiederzukommen.',
      it: '3 azioni semplici oggi per riprendermi bene dopo questo super scan.',
      es: '3 acciones simples hoy para retomar bien tras este super scan.',
      pt: '3 ações simples hoje para recuperar bem após este super scan.',
    }),
    presetRouteKeyFree: 'latest_scan__three_simple_actions',
    presetRouteKeyPremium: 'risk_watch__what_to_monitor_today',
    tags: ['quick', 'starter'],
    rotationPriority: 1,
  },
];
