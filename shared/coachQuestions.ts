import {
  FREE_QUESTION_PROMPT_TYPE,
  resolveVisibleCoachPromptType,
  type CoachGenerationPromptType,
  type CoachPromptType,
} from './coachPromptTypes.ts';

export const COACH_PRESET_QUESTION_MAX_LENGTH = 200;
export const COACH_FREE_QUESTION_MAX_LENGTH = 800;
export const COACH_QUESTION_MAX_LENGTH = COACH_PRESET_QUESTION_MAX_LENGTH;

export const COACH_QUESTION_LOCALES = [
  'fr',
  'en',
  'de',
  'it',
  'es',
  'pt',
] as const;

export const COACH_QUESTION_ARTIFACTS = [
  'priorities',
  'action_steps',
  'warnings',
  'data_gaps',
  'meal_template',
  'meal_swaps',
  'shopping_list',
  'quick_recipe',
  'daily_schedule',
  'micro_routine',
  'habit_tracker',
  'reminders',
  'knowledge_card',
  'next_scan_suggestion',
  'signal_watch',
  'primary_metric_delta',
  'context_notes',
] as const;

export const COACH_QUESTION_TIME_SCOPES = [
  'now',
  'today',
  'tonight',
  'week',
  'forty_eight_hours',
  'ongoing',
] as const;

export const COACH_QUESTION_MEAL_SLOTS = [
  'breakfast',
  'lunch',
  'dinner',
] as const;

export const COACH_QUESTION_TIME_OF_DAY_VALUES = [
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
] as const;

export const COACH_QUESTION_INTENT_KEYS = [
  'latest_scan_priority_today',
  'latest_scan_three_actions',
  'latest_scan_avoid_regression',
  'latest_scan_ten_minute_reset',
  'weekly_plan_realistic',
  'weekly_plan_easy_goals',
  'weekly_plan_energy_balance',
  'weekly_plan_progress_without_burnout',
  'nutrition_breakfast_steady',
  'nutrition_lunch_balance',
  'nutrition_dinner_recovery',
  'nutrition_meal_swaps',
  'nutrition_shopping_list',
  'body_weekly_plan',
  'body_low_energy_session',
  'body_mobility_posture',
  'body_move_with_less_fatigue',
  'body_restart_after_break',
  'face_morning_routine',
  'face_evening_routine',
  'face_glow_simple',
  'face_reduce_tired_look',
  'face_avoid_irritation',
  'hydration_daily_rhythm',
  'hydration_active_day',
  'hydration_tracking_signals',
  'hydration_morning_anchor',
  'hydration_evening_recovery',
  'sleep_evening_routine',
  'sleep_tonight_reset',
  'sleep_pre_big_day',
  'sleep_afternoon_cutoff',
  'sleep_wake_up_better',
  'risk_watch_calm',
  'risk_escalation',
  'risk_watch_priority_today',
  'risk_watch_logging',
  'risk_watch_urgent_change',
  'trend_week_review',
  'trend_improving',
  'trend_blocked',
  'trend_continue',
  'trend_next_adjustment',
  'trend_biggest_regression',
  'free_question_open',
  'recovery_reset_48h',
  'recovery_restart_after_excess',
  'recovery_today_after_bad_night',
  'recovery_two_day_rhythm',
  'recovery_pause_to_recover',
] as const;

export type CoachQuestionLocale = (typeof COACH_QUESTION_LOCALES)[number];
export type CoachQuestionArtifact = (typeof COACH_QUESTION_ARTIFACTS)[number];
export type CoachQuestionTimeScope = (typeof COACH_QUESTION_TIME_SCOPES)[number];
export type CoachQuestionMealSlot = (typeof COACH_QUESTION_MEAL_SLOTS)[number];
export type CoachQuestionTimeOfDay = (typeof COACH_QUESTION_TIME_OF_DAY_VALUES)[number];
export type CoachQuestionIntentKey = (typeof COACH_QUESTION_INTENT_KEYS)[number];

export const COACH_WORKFLOW_ROUTES = [
  'free_question',
  'latest_scan',
  'weekly_plan',
  'nutrition_meal',
  'nutrition_swaps',
  'nutrition_shopping',
  'body_focus',
  'face_focus',
  'hydration_focus',
  'sleep_coach',
  'risk_watch_calm',
  'risk_watch_escalation',
  'risk_watch_logging',
  'trend_review_summary',
  'trend_review_blocked',
  'trend_review_continue',
  'recovery_reset_48h',
  'recovery_restart',
  'no_scan',
  'general_fallback',
] as const;

export type CoachWorkflowRoute = (typeof COACH_WORKFLOW_ROUTES)[number];

export type CoachQuestionKey =
  | 'latest_scan__top_priority_today'
  | 'latest_scan__three_simple_actions'
  | 'latest_scan__avoid_worse_today'
  | 'latest_scan__ten_minute_priority'
  | 'weekly_plan__realistic_week'
  | 'weekly_plan__seven_day_easy_goals'
  | 'weekly_plan__organize_meals_workouts'
  | 'weekly_plan__progress_without_burning_out'
  | 'nutrition_focus__breakfast_no_crash'
  | 'nutrition_focus__simple_lunch_balance'
  | 'nutrition_focus__light_recovery_dinner'
  | 'nutrition_focus__smart_swaps_week'
  | 'nutrition_focus__minimal_three_day_shopping'
  | 'body_focus__weekly_mini_plan'
  | 'body_focus__short_session_low_energy'
  | 'body_focus__mobility_posture_priorities'
  | 'body_focus__move_better_less_fatigue'
  | 'body_focus__comeback_after_days_off'
  | 'face_focus__simple_morning_routine'
  | 'face_focus__evening_routine_recovery'
  | 'face_focus__improve_glow_simple'
  | 'face_focus__habits_for_tired_look'
  | 'face_focus__avoid_irritating_skincare'
  | 'hydration_focus__easy_daily_hydration'
  | 'hydration_focus__active_day_hydration'
  | 'hydration_focus__hydration_signals'
  | 'hydration_focus__morning_anchor_glass'
  | 'hydration_focus__rehydrate_tonight'
  | 'sleep_coach__best_evening_routine'
  | 'sleep_coach__change_tonight_for_tomorrow'
  | 'sleep_coach__pre_big_day_bed_protocol'
  | 'sleep_coach__protect_sleep_from_afternoon'
  | 'sleep_coach__wake_up_clearer_tomorrow'
  | 'risk_watch__calm_signals_week'
  | 'risk_watch__when_to_seek_pro_help'
  | 'risk_watch__what_to_monitor_today'
  | 'risk_watch__how_to_log_signals'
  | 'risk_watch__what_change_requires_faster_action'
  | 'trend_review__week_progress_review'
  | 'trend_review__what_is_improving'
  | 'trend_review__what_is_stuck'
  | 'trend_review__habits_to_continue'
  | 'trend_review__next_adjustment_this_week'
  | 'trend_review__biggest_regression_to_watch'
  | 'recovery_plan__reset_after_bad_week'
  | 'recovery_plan__simple_restart_after_excess'
  | 'recovery_plan__today_after_bad_night'
  | 'recovery_plan__two_day_recovery_rhythm'
  | 'recovery_plan__what_to_pause_for_recovery';

export type CoachQuestionContextScanType =
  | 'face'
  | 'health'
  | 'body'
  | 'nutrition'
  | 'super';

export interface CoachQuestionHints {
  intent_key: CoachQuestionIntentKey;
  time_scope: CoachQuestionTimeScope;
  preferred_artifacts: CoachQuestionArtifact[];
  discouraged_artifacts?: CoachQuestionArtifact[];
  meal_slot?: CoachQuestionMealSlot | null;
  ui_tags?: string[];
}

export interface CoachQuestionDefinition extends CoachQuestionHints {
  key: CoachQuestionKey;
  promptType: CoachPromptType;
  translations: Record<CoachQuestionLocale, string>;
}

export interface CoachQuestionRankingContext {
  timeOfDay?: CoachQuestionTimeOfDay | null;
  primaryScanType?: CoachQuestionContextScanType | null;
  hasSuperScan?: boolean;
  historyDepth?: number | null;
}

const FREE_QUESTION_COACH_HINTS: CoachQuestionHints = {
  intent_key: 'free_question_open',
  time_scope: 'ongoing',
  preferred_artifacts: ['priorities', 'action_steps', 'context_notes'],
  discouraged_artifacts: ['shopping_list'],
  meal_slot: null,
  ui_tags: ['free_question'],
};

type CoachQuestionHintSeed = Omit<
  CoachQuestionDefinition,
  'key' | 'promptType' | 'translations'
>;

const buildQuestion = (
  key: CoachQuestionKey,
  promptType: CoachPromptType,
  translations: Record<CoachQuestionLocale, string>,
  hints: CoachQuestionHintSeed,
): CoachQuestionDefinition => ({
  key,
  promptType,
  translations,
  ...hints,
});

export const COACH_QUESTION_DEFINITIONS: readonly CoachQuestionDefinition[] = [
  buildQuestion(
    'latest_scan__top_priority_today',
    'latest_scan',
    {
      fr: "Quelle priorite n°1 traiter aujourd'hui ?",
      en: 'What is the number one priority to tackle today?',
      de: 'Welche Prioritat Nummer eins sollte ich heute angehen?',
      it: 'Quale priorita numero uno affrontare oggi?',
      es: 'Cual es la prioridad numero uno a abordar hoy?',
      pt: 'Qual a prioridade numero um para encarar hoje?',
    },
    {
      intent_key: 'latest_scan_priority_today',
      time_scope: 'today',
      preferred_artifacts: ['priorities', 'action_steps', 'knowledge_card'],
      discouraged_artifacts: ['daily_schedule', 'shopping_list'],
      meal_slot: null,
      ui_tags: ['starter', 'priority', 'morning'],
    },
  ),
  buildQuestion(
    'latest_scan__three_simple_actions',
    'latest_scan',
    {
      fr: "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
      en: 'Which three simple actions will have the biggest impact by tonight?',
      de: 'Welche drei einfachen Aktionen werden bis heute Abend den grossten Effekt haben?',
      it: 'Quali tre azioni semplici avranno il maggiore impatto entro stasera?',
      es: 'Que tres acciones simples tendran mas impacto de aqui a esta noche?',
      pt: 'Quais tres acoes simples terao mais impacto ate esta noite?',
    },
    {
      intent_key: 'latest_scan_three_actions',
      time_scope: 'today',
      preferred_artifacts: ['action_steps', 'reminders', 'knowledge_card'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['quick', 'midday', 'evening'],
    },
  ),
  buildQuestion(
    'latest_scan__avoid_worse_today',
    'latest_scan',
    {
      fr: "Qu'est-ce que je dois eviter aujourd'hui pour ne pas aggraver mes points faibles ?",
      en: 'What should I avoid today so I do not make my weak points worse?',
      de: 'Was sollte ich heute vermeiden, damit sich meine Schwachstellen nicht verschlechtern?',
      it: 'Che cosa dovrei evitare oggi per non peggiorare i miei punti deboli?',
      es: 'Que debo evitar hoy para no empeorar mis puntos debiles?',
      pt: 'O que devo evitar hoje para nao piorar meus pontos fracos?',
    },
    {
      intent_key: 'latest_scan_avoid_regression',
      time_scope: 'today',
      preferred_artifacts: ['warnings', 'action_steps', 'data_gaps'],
      discouraged_artifacts: ['daily_schedule', 'shopping_list'],
      meal_slot: null,
      ui_tags: ['protect', 'midday', 'evening'],
    },
  ),
  buildQuestion(
    'latest_scan__ten_minute_priority',
    'latest_scan',
    {
      fr: "Si je n'ai que 10 minutes, que faire maintenant ?",
      en: 'If I only have 10 minutes, what should I do right now?',
      de: 'Wenn ich nur 10 Minuten habe, was sollte ich jetzt tun?',
      it: 'Se ho solo 10 minuti, che cosa dovrei fare adesso?',
      es: 'Si solo tengo 10 minutos, que deberia hacer ahora mismo?',
      pt: 'Se eu so tiver 10 minutos, o que devo fazer agora?',
    },
    {
      intent_key: 'latest_scan_ten_minute_reset',
      time_scope: 'now',
      preferred_artifacts: ['micro_routine', 'action_steps', 'reminders'],
      discouraged_artifacts: ['daily_schedule', 'shopping_list'],
      meal_slot: null,
      ui_tags: ['quick', 'morning', 'afternoon', 'evening'],
    },
  ),
  buildQuestion(
    'weekly_plan__realistic_week',
    'weekly_plan',
    {
      fr: 'Construis-moi une semaine realiste skincare + nutrition + sport.',
      en: 'Build me a realistic week for skincare, nutrition, and training.',
      de: 'Erstelle mir eine realistische Woche fur Hautpflege, Ernahrung und Training.',
      it: 'Costruiscimi una settimana realistica tra skincare, alimentazione e sport.',
      es: 'Construyeme una semana realista de skincare, nutricion y deporte.',
      pt: 'Monte para mim uma semana realista de skincare, nutricao e treino.',
    },
    {
      intent_key: 'weekly_plan_realistic',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'micro_routine'],
      discouraged_artifacts: ['signal_watch'],
      meal_slot: null,
      ui_tags: ['planning', 'starter', 'week'],
    },
  ),
  buildQuestion(
    'weekly_plan__seven_day_easy_goals',
    'weekly_plan',
    {
      fr: 'Fais-moi un planning 7 jours avec des objectifs faciles a tenir.',
      en: 'Give me a seven-day schedule with goals that are easy to stick to.',
      de: 'Erstelle mir einen 7-Tage-Plan mit Zielen, die leicht durchzuhalten sind.',
      it: 'Fammi un piano di 7 giorni con obiettivi facili da seguire.',
      es: 'Hazme una planificacion de 7 dias con objetivos faciles de mantener.',
      pt: 'Crie um planejamento de 7 dias com objetivos faceis de manter.',
    },
    {
      intent_key: 'weekly_plan_easy_goals',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'reminders'],
      discouraged_artifacts: ['signal_watch'],
      meal_slot: null,
      ui_tags: ['planning', 'starter', 'week'],
    },
  ),
  buildQuestion(
    'weekly_plan__organize_meals_workouts',
    'weekly_plan',
    {
      fr: "Comment organiser mes repas et mes seances sans exploser mon energie ?",
      en: 'How should I organize my meals and workouts without draining my energy?',
      de: 'Wie kann ich meine Mahlzeiten und Trainings organisieren, ohne meine Energie zu sprengen?',
      it: 'Come posso organizzare pasti e allenamenti senza prosciugare le energie?',
      es: 'Como organizo mis comidas y entrenamientos sin vaciar mi energia?',
      pt: 'Como organizar minhas refeicoes e treinos sem estourar minha energia?',
    },
    {
      intent_key: 'weekly_plan_energy_balance',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'meal_template', 'micro_routine'],
      discouraged_artifacts: ['signal_watch'],
      meal_slot: null,
      ui_tags: ['planning', 'meal', 'body', 'week'],
    },
  ),
  buildQuestion(
    'weekly_plan__progress_without_burning_out',
    'weekly_plan',
    {
      fr: 'Quel plan de semaine suivre si je veux progresser sans me cramer ?',
      en: 'What weekly plan should I follow if I want to progress without burning out?',
      de: 'Welchen Wochenplan sollte ich befolgen, wenn ich Fortschritte machen will, ohne auszubrennen?',
      it: 'Quale piano settimanale seguire se voglio progredire senza esaurirmi?',
      es: 'Que plan semanal deberia seguir si quiero progresar sin quemarme?',
      pt: 'Que plano semanal seguir se eu quiser progredir sem me esgotar?',
    },
    {
      intent_key: 'weekly_plan_progress_without_burnout',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'warnings'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['planning', 'recovery', 'week'],
    },
  ),
  buildQuestion(
    'nutrition_focus__breakfast_no_crash',
    'nutrition_focus',
    {
      fr: "Quel petit-dejeuner m'aidera a tenir sans fringale ?",
      en: 'What breakfast will help me stay steady without crashing or snacking?',
      de: 'Welches Fruhstuck hilft mir, stabil zu bleiben, ohne Heisshunger zu bekommen?',
      it: 'Quale colazione mi aiutera a reggere senza attacchi di fame?',
      es: 'Que desayuno me ayudara a aguantar sin ataques de hambre?',
      pt: 'Qual cafe da manha vai me ajudar a aguentar sem ataque de fome?',
    },
    {
      intent_key: 'nutrition_breakfast_steady',
      time_scope: 'today',
      preferred_artifacts: ['meal_template', 'quick_recipe', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: 'breakfast',
      ui_tags: ['meal', 'breakfast', 'morning', 'quick'],
    },
  ),
  buildQuestion(
    'nutrition_focus__simple_lunch_balance',
    'nutrition_focus',
    {
      fr: "Quel dejeuner simple ameliorerait le plus mon equilibre aujourd'hui ?",
      en: 'Which simple lunch would improve my balance the most today?',
      de: 'Welches einfache Mittagessen wurde mein Gleichgewicht heute am meisten verbessern?',
      it: 'Quale pranzo semplice migliorerebbe di piu il mio equilibrio oggi?',
      es: 'Que almuerzo sencillo mejoraria mas mi equilibrio hoy?',
      pt: 'Qual almoco simples melhoraria mais meu equilibrio hoje?',
    },
    {
      intent_key: 'nutrition_lunch_balance',
      time_scope: 'today',
      preferred_artifacts: ['meal_template', 'quick_recipe', 'meal_swaps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: 'lunch',
      ui_tags: ['meal', 'lunch', 'midday'],
    },
  ),
  buildQuestion(
    'nutrition_focus__light_recovery_dinner',
    'nutrition_focus',
    {
      fr: 'Que cuisiner ce soir pour mieux recuperer sans repas trop lourd ?',
      en: 'What should I cook tonight to recover better without a heavy meal?',
      de: 'Was sollte ich heute Abend kochen, um besser zu regenerieren, ohne schwer zu essen?',
      it: 'Cosa cucinare stasera per recuperare meglio senza un pasto pesante?',
      es: 'Que cocinar esta noche para recuperarme mejor sin una cena pesada?',
      pt: 'O que cozinhar hoje a noite para recuperar melhor sem refeicao pesada?',
    },
    {
      intent_key: 'nutrition_dinner_recovery',
      time_scope: 'tonight',
      preferred_artifacts: ['meal_template', 'quick_recipe', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: 'dinner',
      ui_tags: ['meal', 'dinner', 'evening', 'recovery'],
    },
  ),
  buildQuestion(
    'nutrition_focus__smart_swaps_week',
    'nutrition_focus',
    {
      fr: 'Quels swaps malins faire cette semaine pour manger mieux sans frustration ?',
      en: 'What smart swaps should I make this week to eat better without frustration?',
      de: 'Welche cleveren Alternativen sollte ich diese Woche nutzen, um besser zu essen, ohne Frust?',
      it: 'Quali sostituzioni intelligenti fare questa settimana per mangiare meglio senza frustrazione?',
      es: 'Que cambios inteligentes hacer esta semana para comer mejor sin frustracion?',
      pt: 'Quais trocas inteligentes fazer nesta semana para comer melhor sem frustracao?',
    },
    {
      intent_key: 'nutrition_meal_swaps',
      time_scope: 'week',
      preferred_artifacts: ['meal_swaps', 'knowledge_card', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['swaps', 'week', 'nutrition'],
    },
  ),
  buildQuestion(
    'nutrition_focus__minimal_three_day_shopping',
    'nutrition_focus',
    {
      fr: 'Quelle liste de courses minimale acheter pour 3 jours de repas utiles ?',
      en: 'What minimum shopping list should I buy for three useful days of meals?',
      de: 'Welche minimale Einkaufsliste sollte ich fur drei sinnvolle Essenstage kaufen?',
      it: 'Quale lista della spesa minima comprare per 3 giorni di pasti utili?',
      es: 'Que lista minima de compras deberia hacer para 3 dias de comidas utiles?',
      pt: 'Qual lista minima de compras devo fazer para 3 dias de refeicoes uteis?',
    },
    {
      intent_key: 'nutrition_shopping_list',
      time_scope: 'week',
      preferred_artifacts: ['shopping_list', 'quick_recipe', 'meal_template'],
      discouraged_artifacts: ['meal_swaps'],
      meal_slot: null,
      ui_tags: ['shopping', 'planning', 'week', 'nutrition'],
    },
  ),
  buildQuestion(
    'body_focus__weekly_mini_plan',
    'body_focus',
    {
      fr: 'Quel mini-plan sport faire cette semaine selon mon etat actuel ?',
      en: 'What mini training plan should I follow this week based on my current state?',
      de: 'Welchen Mini-Trainingsplan sollte ich diese Woche entsprechend meinem aktuellen Zustand machen?',
      it: 'Quale mini piano sportivo seguire questa settimana in base al mio stato attuale?',
      es: 'Que mini plan de entrenamiento hacer esta semana segun mi estado actual?',
      pt: 'Que mini plano de treino fazer nesta semana de acordo com meu estado atual?',
    },
    {
      intent_key: 'body_weekly_plan',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['planning', 'body', 'week'],
    },
  ),
  buildQuestion(
    'body_focus__short_session_low_energy',
    'body_focus',
    {
      fr: "Quelle seance courte faire aujourd'hui si je manque d'energie ?",
      en: 'What short session should I do today if I am low on energy?',
      de: 'Welche kurze Einheit sollte ich heute machen, wenn mir Energie fehlt?',
      it: 'Quale sessione breve fare oggi se ho poca energia?',
      es: 'Que sesion corta deberia hacer hoy si me falta energia?',
      pt: 'Que sessao curta devo fazer hoje se eu estiver sem energia?',
    },
    {
      intent_key: 'body_low_energy_session',
      time_scope: 'today',
      preferred_artifacts: ['micro_routine', 'action_steps', 'warnings'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['body', 'quick', 'low_energy', 'afternoon', 'evening'],
    },
  ),
  buildQuestion(
    'body_focus__mobility_posture_priorities',
    'body_focus',
    {
      fr: 'Quelles priorites mobilite ou posture travailler en premier ?',
      en: 'Which mobility or posture priorities should I work on first?',
      de: 'Welche Beweglichkeits- oder Haltungsprioritaten sollte ich zuerst angehen?',
      it: 'Quali priorita di mobilita o postura dovrei lavorare per prime?',
      es: 'Que prioridades de movilidad o postura deberia trabajar primero?',
      pt: 'Quais prioridades de mobilidade ou postura devo trabalhar primeiro?',
    },
    {
      intent_key: 'body_mobility_posture',
      time_scope: 'week',
      preferred_artifacts: ['micro_routine', 'action_steps', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['body', 'mobility', 'posture', 'planning'],
    },
  ),
  buildQuestion(
    'body_focus__move_better_less_fatigue',
    'body_focus',
    {
      fr: 'Comment bouger mieux sans me fatiguer davantage cette semaine ?',
      en: 'How can I move better this week without making myself more tired?',
      de: 'Wie kann ich mich diese Woche besser bewegen, ohne mich noch mehr zu ermuden?',
      it: 'Come posso muovermi meglio questa settimana senza affaticarmi di piu?',
      es: 'Como moverme mejor esta semana sin cansarme mas?',
      pt: 'Como me mover melhor nesta semana sem me cansar ainda mais?',
    },
    {
      intent_key: 'body_move_with_less_fatigue',
      time_scope: 'week',
      preferred_artifacts: ['micro_routine', 'habit_tracker', 'warnings'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['body', 'recovery', 'week'],
    },
  ),
  buildQuestion(
    'body_focus__comeback_after_days_off',
    'body_focus',
    {
      fr: 'Quel plan reprise sport suivre apres quelques jours off ?',
      en: 'What restart plan should I follow after a few days off from training?',
      de: 'Welchen Wiedereinstiegsplan sollte ich nach ein paar trainingsfreien Tagen befolgen?',
      it: 'Quale piano di ripresa seguire dopo qualche giorno di pausa?',
      es: 'Que plan de vuelta al deporte seguir despues de unos dias de pausa?',
      pt: 'Que plano de retorno ao treino seguir depois de alguns dias parado?',
    },
    {
      intent_key: 'body_restart_after_break',
      time_scope: 'week',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['body', 'planning', 'restart', 'week'],
    },
  ),
  buildQuestion(
    'face_focus__simple_morning_routine',
    'face_focus',
    {
      fr: "Quelle routine matin simple suivre pour avoir l'air plus frais ?",
      en: 'What simple morning routine should I follow to look more refreshed?',
      de: 'Welche einfache Morgenroutine sollte ich befolgen, um frischer auszusehen?',
      it: 'Quale routine mattutina semplice seguire per avere un aspetto piu fresco?',
      es: 'Que rutina de manana sencilla seguir para verme mas fresco?',
      pt: 'Que rotina simples de manha seguir para parecer mais descansado?',
    },
    {
      intent_key: 'face_morning_routine',
      time_scope: 'today',
      preferred_artifacts: ['micro_routine', 'reminders', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['face', 'morning', 'starter'],
    },
  ),
  buildQuestion(
    'face_focus__evening_routine_recovery',
    'face_focus',
    {
      fr: 'Quelle routine soir prioriser cette semaine pour recuperer cote peau ?',
      en: 'Which evening routine should I prioritize this week to help my skin recover?',
      de: 'Welche Abendroutine sollte ich diese Woche priorisieren, damit sich meine Haut besser erholt?',
      it: 'Quale routine serale dovrei privilegiare questa settimana per aiutare la pelle a recuperare?',
      es: 'Que rutina de noche deberia priorizar esta semana para ayudar a mi piel a recuperarse?',
      pt: 'Que rotina da noite devo priorizar nesta semana para ajudar minha pele a recuperar?',
    },
    {
      intent_key: 'face_evening_routine',
      time_scope: 'tonight',
      preferred_artifacts: ['micro_routine', 'reminders', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['face', 'evening', 'recovery'],
    },
  ),
  buildQuestion(
    'face_focus__improve_glow_simple',
    'face_focus',
    {
      fr: "Que faire pour ameliorer l'eclat sans ajouter 10 produits ?",
      en: 'What can I do to improve glow without adding ten more products?',
      de: 'Was kann ich tun, um mehr Glow zu bekommen, ohne zehn weitere Produkte hinzuzufugen?',
      it: 'Cosa posso fare per migliorare la luminosita senza aggiungere dieci prodotti?',
      es: 'Que puedo hacer para mejorar el brillo sin sumar diez productos?',
      pt: 'O que posso fazer para melhorar o vico sem adicionar dez produtos?',
    },
    {
      intent_key: 'face_glow_simple',
      time_scope: 'week',
      preferred_artifacts: ['action_steps', 'micro_routine', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['face', 'glow', 'week'],
    },
  ),
  buildQuestion(
    'face_focus__habits_for_tired_look',
    'face_focus',
    {
      fr: "Quelles habitudes peuvent aider mes cernes ou mon air fatigue ?",
      en: 'Which habits can help with my dark circles or tired-looking face?',
      de: 'Welche Gewohnheiten konnen meinen Augenringen oder meinem muden Aussehen helfen?',
      it: 'Quali abitudini possono aiutare occhiaie o aspetto stanco?',
      es: 'Que habitos pueden ayudar con mis ojeras o mi aspecto cansado?',
      pt: 'Que habitos podem ajudar minhas olheiras ou meu aspecto cansado?',
    },
    {
      intent_key: 'face_reduce_tired_look',
      time_scope: 'week',
      preferred_artifacts: ['habit_tracker', 'action_steps', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['face', 'recovery', 'tracking', 'week'],
    },
  ),
  buildQuestion(
    'face_focus__avoid_irritating_skincare',
    'face_focus',
    {
      fr: 'Quels gestes skincare eviter cette semaine pour ne pas irriter ma peau ?',
      en: 'Which skincare habits should I avoid this week so I do not irritate my skin?',
      de: 'Welche Skincare-Gewohnheiten sollte ich diese Woche vermeiden, um meine Haut nicht zu reizen?',
      it: 'Quali gesti skincare evitare questa settimana per non irritare la pelle?',
      es: 'Que gestos de skincare deberia evitar esta semana para no irritar mi piel?',
      pt: 'Quais gestos de skincare devo evitar nesta semana para nao irritar minha pele?',
    },
    {
      intent_key: 'face_avoid_irritation',
      time_scope: 'week',
      preferred_artifacts: ['warnings', 'action_steps', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['face', 'protect', 'week'],
    },
  ),
  buildQuestion(
    'hydration_focus__easy_daily_hydration',
    'hydration_focus',
    {
      fr: "Comment repartir mon hydratation sur la journee sans y penser tout le temps ?",
      en: 'How can I spread hydration through the day without thinking about it all the time?',
      de: 'Wie kann ich meine Hydration uber den Tag verteilen, ohne standig daran denken zu mussen?',
      it: "Come posso distribuire l'idratazione durante la giornata senza pensarci continuamente?",
      es: 'Como repartir mi hidratacion durante el dia sin estar pensando en ello todo el tiempo?',
      pt: 'Como distribuir minha hidratacao ao longo do dia sem pensar nisso o tempo todo?',
    },
    {
      intent_key: 'hydration_daily_rhythm',
      time_scope: 'today',
      preferred_artifacts: ['micro_routine', 'reminders', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['morning', 'midday', 'evening', 'tracking', 'starter'],
    },
  ),
  buildQuestion(
    'hydration_focus__active_day_hydration',
    'hydration_focus',
    {
      fr: "Quel plan hydratation suivre les jours ou je bouge davantage ?",
      en: 'What hydration plan should I follow on days when I move more?',
      de: 'Welchen Hydrationsplan sollte ich an Tagen befolgen, an denen ich mich mehr bewege?',
      it: 'Quale piano di idratazione seguire nei giorni in cui mi muovo di piu?',
      es: 'Que plan de hidratacion seguir los dias en que me muevo mas?',
      pt: 'Que plano de hidratacao seguir nos dias em que eu me movo mais?',
    },
    {
      intent_key: 'hydration_active_day',
      time_scope: 'today',
      preferred_artifacts: ['micro_routine', 'reminders', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['active_day', 'midday', 'afternoon'],
    },
  ),
  buildQuestion(
    'hydration_focus__hydration_signals',
    'hydration_focus',
    {
      fr: 'Quels signes simples regarder pour savoir si je gere mieux mon hydratation ?',
      en: 'Which simple signs should I watch to know if I am handling hydration better?',
      de: 'Welche einfachen Anzeichen sollte ich beobachten, um zu wissen, ob ich meine Hydration besser im Griff habe?',
      it: "Quali segnali semplici osservare per capire se sto gestendo meglio l'idratazione?",
      es: 'Que senales simples mirar para saber si estoy manejando mejor mi hidratacion?',
      pt: 'Que sinais simples observar para saber se estou lidando melhor com minha hidratacao?',
    },
    {
      intent_key: 'hydration_tracking_signals',
      time_scope: 'ongoing',
      preferred_artifacts: ['knowledge_card', 'action_steps', 'data_gaps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['tracking', 'hydration', 'week'],
    },
  ),
  buildQuestion(
    'hydration_focus__morning_anchor_glass',
    'hydration_focus',
    {
      fr: "Quel ancrage du matin m'aidera a boire plus regulierement sans effort ?",
      en: 'Which morning anchor will help me drink more consistently without effort?',
      de: 'Welcher Morgenanker hilft mir, ohne Aufwand regelmassiger zu trinken?',
      it: "Quale ancora del mattino mi aiutera a bere con piu regolarita senza sforzo?",
      es: 'Que ancla de la manana me ayudara a beber con mas regularidad sin esfuerzo?',
      pt: 'Que ancora da manha vai me ajudar a beber com mais regularidade sem esforco?',
    },
    {
      intent_key: 'hydration_morning_anchor',
      time_scope: 'now',
      preferred_artifacts: ['micro_routine', 'reminders', 'habit_tracker'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['hydration', 'morning', 'quick'],
    },
  ),
  buildQuestion(
    'hydration_focus__rehydrate_tonight',
    'hydration_focus',
    {
      fr: "Comment me rehydrater ce soir sans boire n'importe comment ?",
      en: 'How should I rehydrate tonight without just drinking randomly?',
      de: 'Wie sollte ich mich heute Abend rehydrieren, ohne einfach wahllos zu trinken?',
      it: 'Come dovrei reidratarmi stasera senza bere a caso?',
      es: 'Como deberia rehidratarme esta noche sin beber de cualquier manera?',
      pt: 'Como devo me reidratar hoje a noite sem sair bebendo de qualquer jeito?',
    },
    {
      intent_key: 'hydration_evening_recovery',
      time_scope: 'tonight',
      preferred_artifacts: ['action_steps', 'micro_routine', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['hydration', 'evening', 'recovery'],
    },
  ),
  buildQuestion(
    'sleep_coach__best_evening_routine',
    'sleep_coach',
    {
      fr: "Quelle routine du soir m'aidera le plus a mieux recuperer ?",
      en: 'Which evening routine will help me recover better the most?',
      de: 'Welche Abendroutine wird mir am meisten helfen, mich besser zu erholen?',
      it: 'Quale routine serale mi aiutera di piu a recuperare meglio?',
      es: 'Que rutina nocturna me ayudara mas a recuperarme mejor?',
      pt: 'Qual rotina noturna mais vai me ajudar a recuperar melhor?',
    },
    {
      intent_key: 'sleep_evening_routine',
      time_scope: 'tonight',
      preferred_artifacts: ['micro_routine', 'reminders', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['sleep', 'evening', 'starter'],
    },
  ),
  buildQuestion(
    'sleep_coach__change_tonight_for_tomorrow',
    'sleep_coach',
    {
      fr: 'Que changer ce soir pour me reveiller moins fatigue demain ?',
      en: 'What should I change tonight so I wake up less tired tomorrow?',
      de: 'Was sollte ich heute Abend andern, damit ich morgen weniger mude aufwache?',
      it: 'Cosa cambiare stasera per svegliarmi meno stanco domani?',
      es: 'Que deberia cambiar esta noche para despertarme menos cansado manana?',
      pt: 'O que mudar hoje a noite para acordar menos cansado amanha?',
    },
    {
      intent_key: 'sleep_tonight_reset',
      time_scope: 'tonight',
      preferred_artifacts: ['action_steps', 'micro_routine', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['sleep', 'evening', 'quick'],
    },
  ),
  buildQuestion(
    'sleep_coach__pre_big_day_bed_protocol',
    'sleep_coach',
    {
      fr: 'Quel protocole coucher suivre les veilles de journee sportive ou chargee ?',
      en: 'Which bedtime protocol should I follow before a training day or a packed day?',
      de: 'Welches Einschlaf-Protokoll sollte ich vor einem Sporttag oder einem vollen Tag befolgen?',
      it: 'Quale protocollo serale seguire alla vigilia di una giornata sportiva o intensa?',
      es: 'Que protocolo de noche seguir antes de un dia deportivo o muy cargado?',
      pt: 'Que protocolo para dormir seguir na vespera de um dia esportivo ou puxado?',
    },
    {
      intent_key: 'sleep_pre_big_day',
      time_scope: 'tonight',
      preferred_artifacts: ['micro_routine', 'reminders', 'knowledge_card'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['sleep', 'evening', 'planning'],
    },
  ),
  buildQuestion(
    'sleep_coach__protect_sleep_from_afternoon',
    'sleep_coach',
    {
      fr: "Que couper ou deplacer des cet apres-midi pour proteger mon sommeil ?",
      en: 'What should I cut or move from this afternoon onward to protect my sleep?',
      de: 'Was sollte ich ab diesem Nachmittag streichen oder verschieben, um meinen Schlaf zu schutzen?',
      it: 'Che cosa dovrei togliere o spostare da questo pomeriggio per proteggere il sonno?',
      es: 'Que deberia quitar o mover desde esta tarde para proteger mi sueno?',
      pt: 'O que devo cortar ou deslocar a partir desta tarde para proteger meu sono?',
    },
    {
      intent_key: 'sleep_afternoon_cutoff',
      time_scope: 'today',
      preferred_artifacts: ['warnings', 'action_steps', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['sleep', 'afternoon', 'quick'],
    },
  ),
  buildQuestion(
    'sleep_coach__wake_up_clearer_tomorrow',
    'sleep_coach',
    {
      fr: 'Que faire ce soir pour me reveiller plus clair demain matin ?',
      en: 'What should I do tonight to wake up clearer tomorrow morning?',
      de: 'Was sollte ich heute Abend tun, um morgen fruher klarer aufzuwachen?',
      it: 'Che cosa dovrei fare stasera per svegliarmi piu lucido domani mattina?',
      es: 'Que deberia hacer esta noche para despertarme mas despejado manana por la manana?',
      pt: 'O que devo fazer hoje a noite para acordar mais desperto amanha de manha?',
    },
    {
      intent_key: 'sleep_wake_up_better',
      time_scope: 'tonight',
      preferred_artifacts: ['micro_routine', 'action_steps', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['sleep', 'evening', 'recovery'],
    },
  ),
  buildQuestion(
    'risk_watch__calm_signals_week',
    'risk_watch',
    {
      fr: 'Quels signaux suivre calmement cette semaine sans tomber dans le stress ?',
      en: 'Which signals should I track calmly this week without spiraling into stress?',
      de: 'Welche Signale sollte ich diese Woche ruhig beobachten, ohne in Stress zu geraten?',
      it: 'Quali segnali seguire con calma questa settimana senza entrare in ansia?',
      es: 'Que senales seguir con calma esta semana sin caer en el estres?',
      pt: 'Quais sinais acompanhar com calma nesta semana sem cair no estresse?',
    },
    {
      intent_key: 'risk_watch_calm',
      time_scope: 'week',
      preferred_artifacts: ['signal_watch', 'action_steps', 'knowledge_card'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['tracking', 'super_scan', 'week'],
    },
  ),
  buildQuestion(
    'risk_watch__when_to_seek_pro_help',
    'risk_watch',
    {
      fr: "A partir de quand un signal merite un vrai avis pro ?",
      en: 'From when does a signal deserve a real professional opinion?',
      de: 'Ab wann verdient ein Signal eine echte professionelle Einschatzung?',
      it: 'Da quando un segnale merita un vero parere professionale?',
      es: 'A partir de cuando una senal merece una opinion profesional real?',
      pt: 'A partir de quando um sinal merece uma opiniao profissional de verdade?',
    },
    {
      intent_key: 'risk_escalation',
      time_scope: 'week',
      preferred_artifacts: ['signal_watch', 'warnings', 'knowledge_card'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['escalation', 'super_scan', 'week'],
    },
  ),
  buildQuestion(
    'risk_watch__what_to_monitor_today',
    'risk_watch',
    {
      fr: "Aujourd'hui, qu'est-ce que je dois surveiller sans me disperser ?",
      en: 'Today, what should I monitor without scattering my attention?',
      de: 'Was sollte ich heute beobachten, ohne mich zu verzetteln?',
      it: 'Oggi, che cosa dovrei monitorare senza disperdere l attenzione?',
      es: 'Hoy, que deberia vigilar sin dispersarme?',
      pt: 'Hoje, o que devo observar sem me dispersar?',
    },
    {
      intent_key: 'risk_watch_priority_today',
      time_scope: 'today',
      preferred_artifacts: ['signal_watch', 'priorities', 'action_steps'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['tracking', 'super_scan', 'today', 'quick'],
    },
  ),
  buildQuestion(
    'risk_watch__how_to_log_signals',
    'risk_watch',
    {
      fr: 'Comment noter proprement mes signaux pour voir une vraie evolution ?',
      en: 'How should I log my signals cleanly so I can see real change?',
      de: 'Wie sollte ich meine Signale sauber notieren, um echte Veranderungen zu sehen?',
      it: 'Come dovrei annotare bene i miei segnali per vedere una vera evoluzione?',
      es: 'Como deberia registrar bien mis senales para ver una evolucion real?',
      pt: 'Como devo anotar meus sinais com clareza para ver uma evolucao real?',
    },
    {
      intent_key: 'risk_watch_logging',
      time_scope: 'week',
      preferred_artifacts: ['signal_watch', 'habit_tracker', 'data_gaps'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['tracking', 'super_scan', 'week', 'engaged'],
    },
  ),
  buildQuestion(
    'risk_watch__what_change_requires_faster_action',
    'risk_watch',
    {
      fr: 'Quel changement devrait me faire reagir plus vite ou demander un avis plus tot ?',
      en: 'Which change should make me react faster or ask for help sooner?',
      de: 'Welche Veranderung sollte mich dazu bringen, schneller zu reagieren oder fruher Hilfe zu suchen?',
      it: 'Quale cambiamento dovrebbe farmi reagire piu in fretta o chiedere aiuto prima?',
      es: 'Que cambio deberia hacerme reaccionar mas rapido o pedir ayuda antes?',
      pt: 'Que mudanca deveria me fazer reagir mais rapido ou pedir ajuda antes?',
    },
    {
      intent_key: 'risk_watch_urgent_change',
      time_scope: 'week',
      preferred_artifacts: ['signal_watch', 'warnings', 'action_steps'],
      discouraged_artifacts: ['daily_schedule'],
      meal_slot: null,
      ui_tags: ['escalation', 'super_scan', 'week'],
    },
  ),
  buildQuestion(
    'trend_review__week_progress_review',
    'trend_review',
    {
      fr: "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
      en: 'Tell me what is improving, what is blocked, and what I should keep doing this week.',
      de: 'Sag mir, was sich verbessert, was blockiert und was ich diese Woche beibehalten sollte.',
      it: 'Dimmi che cosa sta migliorando, che cosa blocca e che cosa dovrei continuare questa settimana.',
      es: 'Dime que esta mejorando, que esta bloqueado y que deberia seguir haciendo esta semana.',
      pt: 'Me diga o que esta melhorando, o que esta travado e o que devo continuar nesta semana.',
    },
    {
      intent_key: 'trend_week_review',
      time_scope: 'week',
      preferred_artifacts: ['context_notes', 'action_steps', 'next_scan_suggestion'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'tracking', 'week', 'starter'],
    },
  ),
  buildQuestion(
    'trend_review__what_is_improving',
    'trend_review',
    {
      fr: "Qu'est-ce qui s'ameliore vraiment en ce moment ?",
      en: 'What is genuinely improving right now?',
      de: 'Was verbessert sich im Moment wirklich?',
      it: 'Che cosa sta migliorando davvero in questo momento?',
      es: 'Que es lo que realmente esta mejorando ahora mismo?',
      pt: 'O que esta realmente melhorando neste momento?',
    },
    {
      intent_key: 'trend_improving',
      time_scope: 'week',
      preferred_artifacts: ['context_notes', 'primary_metric_delta', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'tracking', 'week'],
    },
  ),
  buildQuestion(
    'trend_review__what_is_stuck',
    'trend_review',
    {
      fr: "Qu'est-ce qui bloque encore malgre mes efforts ?",
      en: 'What is still stuck despite my efforts?',
      de: 'Was blockiert trotz meiner Bemuhungen noch immer?',
      it: 'Che cosa e ancora bloccato nonostante i miei sforzi?',
      es: 'Que sigue bloqueado a pesar de mis esfuerzos?',
      pt: 'O que ainda esta travado apesar dos meus esforcos?',
    },
    {
      intent_key: 'trend_blocked',
      time_scope: 'week',
      preferred_artifacts: ['context_notes', 'action_steps', 'warnings'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'blocked', 'week'],
    },
  ),
  buildQuestion(
    'trend_review__habits_to_continue',
    'trend_review',
    {
      fr: "Quelles habitudes valent la peine d'etre continuees cette semaine ?",
      en: 'Which habits are worth continuing this week?',
      de: 'Welche Gewohnheiten lohnen sich, diese Woche fortzusetzen?',
      it: 'Quali abitudini vale la pena continuare questa settimana?',
      es: 'Que habitos vale la pena seguir manteniendo esta semana?',
      pt: 'Quais habitos vale a pena continuar nesta semana?',
    },
    {
      intent_key: 'trend_continue',
      time_scope: 'week',
      preferred_artifacts: ['habit_tracker', 'action_steps', 'context_notes'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'continue', 'week'],
    },
  ),
  buildQuestion(
    'trend_review__next_adjustment_this_week',
    'trend_review',
    {
      fr: 'Quel ajustement concret ferait le plus de difference cette semaine ?',
      en: 'Which concrete adjustment would make the biggest difference this week?',
      de: 'Welche konkrete Anpassung wurde diese Woche den grossten Unterschied machen?',
      it: 'Quale aggiustamento concreto farebbe piu differenza questa settimana?',
      es: 'Que ajuste concreto haria mas diferencia esta semana?',
      pt: 'Que ajuste concreto faria mais diferenca nesta semana?',
    },
    {
      intent_key: 'trend_next_adjustment',
      time_scope: 'week',
      preferred_artifacts: ['priorities', 'action_steps', 'context_notes'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'planning', 'week'],
    },
  ),
  buildQuestion(
    'trend_review__biggest_regression_to_watch',
    'trend_review',
    {
      fr: 'Quelle regression ou derive doit etre surveillee en premier ?',
      en: 'Which regression or drift should be watched first?',
      de: 'Welche Regression oder Abweichung sollte zuerst beobachtet werden?',
      it: 'Quale regressione o deriva dovrebbe essere monitorata per prima?',
      es: 'Que regresion o desvio deberia vigilar primero?',
      pt: 'Que regressao ou desvio devo observar primeiro?',
    },
    {
      intent_key: 'trend_biggest_regression',
      time_scope: 'week',
      preferred_artifacts: ['context_notes', 'warnings', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['trend', 'blocked', 'tracking', 'week'],
    },
  ),
  buildQuestion(
    'recovery_plan__reset_after_bad_week',
    'recovery_plan',
    {
      fr: 'Fais-moi un reset 48h apres une mauvaise semaine.',
      en: 'Give me a 48-hour reset after a rough week.',
      de: 'Gib mir einen 48-Stunden-Reset nach einer harten Woche.',
      it: 'Fammi un reset di 48 ore dopo una settimana difficile.',
      es: 'Hazme un reset de 48 horas despues de una mala semana.',
      pt: 'Monte para mim um reset de 48 horas depois de uma semana ruim.',
    },
    {
      intent_key: 'recovery_reset_48h',
      time_scope: 'forty_eight_hours',
      preferred_artifacts: ['micro_routine', 'habit_tracker', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['recovery', 'reset', 'starter'],
    },
  ),
  buildQuestion(
    'recovery_plan__simple_restart_after_excess',
    'recovery_plan',
    {
      fr: 'Quel plan simple suivre pour repartir proprement apres un exces ou un coup de mou ?',
      en: 'What simple plan should I follow to restart cleanly after overdoing it or a slump?',
      de: 'Welchen einfachen Plan sollte ich befolgen, um nach einem Ausrutscher oder Durchhanger sauber neu zu starten?',
      it: 'Quale piano semplice seguire per ripartire bene dopo un eccesso o un calo?',
      es: 'Que plan simple seguir para retomar bien despues de un exceso o un bajon?',
      pt: 'Que plano simples seguir para recomecar bem depois de um excesso ou de um baque?',
    },
    {
      intent_key: 'recovery_restart_after_excess',
      time_scope: 'forty_eight_hours',
      preferred_artifacts: ['micro_routine', 'action_steps', 'warnings'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['recovery', 'restart', 'quick'],
    },
  ),
  buildQuestion(
    'recovery_plan__today_after_bad_night',
    'recovery_plan',
    {
      fr: "Quel plan minimum suivre aujourd'hui apres une mauvaise nuit ?",
      en: 'Which minimum plan should I follow today after a bad night?',
      de: 'Welchen Minimalplan sollte ich heute nach einer schlechten Nacht befolgen?',
      it: 'Quale piano minimo dovrei seguire oggi dopo una brutta notte?',
      es: 'Que plan minimo deberia seguir hoy despues de una mala noche?',
      pt: 'Que plano minimo devo seguir hoje depois de uma noite ruim?',
    },
    {
      intent_key: 'recovery_today_after_bad_night',
      time_scope: 'today',
      preferred_artifacts: ['priorities', 'action_steps', 'micro_routine'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['recovery', 'morning', 'quick', 'starter'],
    },
  ),
  buildQuestion(
    'recovery_plan__two_day_recovery_rhythm',
    'recovery_plan',
    {
      fr: 'Comment organiser mes prochaines 48h pour retrouver un rythme propre ?',
      en: 'How should I organize my next 48 hours to recover a cleaner rhythm?',
      de: 'Wie sollte ich meine nachsten 48 Stunden organisieren, um wieder in einen sauberen Rhythmus zu kommen?',
      it: 'Come dovrei organizzare le prossime 48 ore per ritrovare un ritmo piu pulito?',
      es: 'Como deberia organizar mis proximas 48 horas para recuperar un ritmo mas limpio?',
      pt: 'Como devo organizar minhas proximas 48 horas para recuperar um ritmo mais limpo?',
    },
    {
      intent_key: 'recovery_two_day_rhythm',
      time_scope: 'forty_eight_hours',
      preferred_artifacts: ['daily_schedule', 'habit_tracker', 'reminders'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['recovery', 'planning', 'week'],
    },
  ),
  buildQuestion(
    'recovery_plan__what_to_pause_for_recovery',
    'recovery_plan',
    {
      fr: 'Qu est-ce que je devrais mettre en pause 48h pour recuperer plus vite ?',
      en: 'What should I pause for 48 hours so I recover faster?',
      de: 'Was sollte ich fur 48 Stunden pausieren, damit ich schneller erhole?',
      it: 'Che cosa dovrei mettere in pausa per 48 ore per recuperare piu in fretta?',
      es: 'Que deberia poner en pausa 48 horas para recuperarme mas rapido?',
      pt: 'O que devo colocar em pausa por 48 horas para recuperar mais rapido?',
    },
    {
      intent_key: 'recovery_pause_to_recover',
      time_scope: 'forty_eight_hours',
      preferred_artifacts: ['warnings', 'priorities', 'action_steps'],
      discouraged_artifacts: ['shopping_list'],
      meal_slot: null,
      ui_tags: ['recovery', 'protect', 'quick'],
    },
  ),
] as const;

const COACH_QUESTION_MAP = new Map(
  COACH_QUESTION_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const COACH_QUESTION_KEY_ALIASES: Readonly<Record<string, CoachQuestionKey>> = {
  trend_comparison__week_progress_review:
    'trend_review__week_progress_review',
  trend_comparison__what_is_improving:
    'trend_review__what_is_improving',
  trend_comparison__what_is_stuck:
    'trend_review__what_is_stuck',
  trend_comparison__habits_to_continue:
    'trend_review__habits_to_continue',
  trend_comparison__next_adjustment_this_week:
    'trend_review__next_adjustment_this_week',
  trend_comparison__biggest_regression_to_watch:
    'trend_review__biggest_regression_to_watch',
};

const COACH_QUESTIONS_BY_PROMPT = new Map<
  CoachPromptType,
  CoachQuestionDefinition[]
>();
for (const definition of COACH_QUESTION_DEFINITIONS) {
  const group = COACH_QUESTIONS_BY_PROMPT.get(definition.promptType) ?? [];
  group.push(definition);
  COACH_QUESTIONS_BY_PROMPT.set(definition.promptType, group);
}

const COACH_QUESTION_ARTIFACT_SET = new Set<string>(COACH_QUESTION_ARTIFACTS);
const COACH_QUESTION_TIME_SCOPE_SET = new Set<string>(COACH_QUESTION_TIME_SCOPES);
const COACH_QUESTION_MEAL_SLOT_SET = new Set<string>(COACH_QUESTION_MEAL_SLOTS);
const COACH_QUESTION_INTENT_KEY_SET = new Set<string>(COACH_QUESTION_INTENT_KEYS);

const COACH_QUESTION_TEXT_ALIASES: ReadonlyArray<{
  normalizedText: string;
  promptType: CoachPromptType;
  key: CoachQuestionKey;
}> = [
  {
    normalizedText:
      'dis moi ce qui s ameliore ce qui bloque et quoi continuer cette semaine',
    promptType: 'trend_review',
    key: 'trend_review__week_progress_review',
  },
];

const COACH_WORKFLOW_ROUTE_BY_INTENT_KEY: Readonly<
  Record<CoachQuestionIntentKey, CoachWorkflowRoute>
> = {
  latest_scan_priority_today: 'latest_scan',
  latest_scan_three_actions: 'latest_scan',
  latest_scan_avoid_regression: 'latest_scan',
  latest_scan_ten_minute_reset: 'latest_scan',
  weekly_plan_realistic: 'weekly_plan',
  weekly_plan_easy_goals: 'weekly_plan',
  weekly_plan_energy_balance: 'weekly_plan',
  weekly_plan_progress_without_burnout: 'weekly_plan',
  nutrition_breakfast_steady: 'nutrition_meal',
  nutrition_lunch_balance: 'nutrition_meal',
  nutrition_dinner_recovery: 'nutrition_meal',
  nutrition_meal_swaps: 'nutrition_swaps',
  nutrition_shopping_list: 'nutrition_shopping',
  body_weekly_plan: 'body_focus',
  body_low_energy_session: 'body_focus',
  body_mobility_posture: 'body_focus',
  body_move_with_less_fatigue: 'body_focus',
  body_restart_after_break: 'body_focus',
  face_morning_routine: 'face_focus',
  face_evening_routine: 'face_focus',
  face_glow_simple: 'face_focus',
  face_reduce_tired_look: 'face_focus',
  face_avoid_irritation: 'face_focus',
  hydration_daily_rhythm: 'hydration_focus',
  hydration_active_day: 'hydration_focus',
  hydration_tracking_signals: 'hydration_focus',
  hydration_morning_anchor: 'hydration_focus',
  hydration_evening_recovery: 'hydration_focus',
  sleep_evening_routine: 'sleep_coach',
  sleep_tonight_reset: 'sleep_coach',
  sleep_pre_big_day: 'sleep_coach',
  sleep_afternoon_cutoff: 'sleep_coach',
  sleep_wake_up_better: 'sleep_coach',
  risk_watch_calm: 'risk_watch_calm',
  risk_escalation: 'risk_watch_escalation',
  risk_watch_priority_today: 'risk_watch_calm',
  risk_watch_logging: 'risk_watch_logging',
  risk_watch_urgent_change: 'risk_watch_escalation',
  trend_week_review: 'trend_review_summary',
  trend_improving: 'trend_review_summary',
  trend_blocked: 'trend_review_blocked',
  trend_continue: 'trend_review_continue',
  trend_next_adjustment: 'trend_review_continue',
  trend_biggest_regression: 'trend_review_blocked',
  free_question_open: 'free_question',
  recovery_reset_48h: 'recovery_reset_48h',
  recovery_restart_after_excess: 'recovery_restart',
  recovery_today_after_bad_night: 'recovery_restart',
  recovery_two_day_rhythm: 'recovery_reset_48h',
  recovery_pause_to_recover: 'recovery_reset_48h',
};

const COACH_WORKFLOW_DEFAULT_ROUTE_BY_PROMPT_TYPE: Readonly<
  Record<CoachPromptType, CoachWorkflowRoute>
> = {
  latest_scan: 'latest_scan',
  weekly_plan: 'weekly_plan',
  nutrition_focus: 'nutrition_meal',
  body_focus: 'body_focus',
  face_focus: 'face_focus',
  hydration_focus: 'hydration_focus',
  sleep_coach: 'sleep_coach',
  risk_watch: 'risk_watch_calm',
  trend_review: 'trend_review_summary',
  recovery_plan: 'recovery_reset_48h',
};

function cloneCoachQuestionHints(hints: CoachQuestionHints): CoachQuestionHints {
  return {
    intent_key: hints.intent_key,
    time_scope: hints.time_scope,
    preferred_artifacts: [...hints.preferred_artifacts],
    ...(hints.discouraged_artifacts && hints.discouraged_artifacts.length > 0
      ? { discouraged_artifacts: [...hints.discouraged_artifacts] }
      : {}),
    ...(hints.meal_slot ? { meal_slot: hints.meal_slot } : {}),
    ...(hints.ui_tags && hints.ui_tags.length > 0
      ? { ui_tags: [...hints.ui_tags] }
      : {}),
  };
}

function uniqueCoachQuestionArtifacts(
  value: unknown,
): CoachQuestionArtifact[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized: CoachQuestionArtifact[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !COACH_QUESTION_ARTIFACT_SET.has(entry)) {
      return null;
    }

    if (!seen.has(entry)) {
      seen.add(entry);
      normalized.push(entry as CoachQuestionArtifact);
    }
  }

  return normalized.length > 0 ? normalized : null;
}

function uniqueCoachQuestionTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null;
    }

    const tag = entry.trim().toLowerCase();
    if (!tag || tag.length > 32) {
      return null;
    }

    if (!seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  }

  return normalized;
}

function normalizeCoachQuestionMatchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeCoachQuestionText(value: unknown) {
  return normalizeCoachQuestionMatchText(value).replace(/\s+/g, '_');
}

function normalizeCoachQuestionKeyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (COACH_QUESTION_MAP.has(normalized as CoachQuestionKey)) {
    return normalized as CoachQuestionKey;
  }

  return COACH_QUESTION_KEY_ALIASES[normalized] ?? null;
}

function includesAnyCoachQuestionPattern(
  normalizedText: string,
  patterns: readonly string[],
) {
  return patterns.some((pattern) => normalizedText.includes(pattern));
}

function includesAllCoachQuestionPatterns(
  normalizedText: string,
  patterns: readonly string[],
) {
  return patterns.every((pattern) => normalizedText.includes(pattern));
}

function normalizeCoachQuestionContextScanType(
  value: CoachQuestionRankingContext['primaryScanType'],
) {
  if (!value) {
    return null;
  }

  return value === 'health' ? 'face' : value;
}

function resolveCoachQuestionHistoryBand(historyDepth?: number | null) {
  if (!Number.isFinite(historyDepth)) {
    return 'new';
  }

  const normalizedHistoryDepth = historyDepth ?? 0;
  if (normalizedHistoryDepth <= 0) {
    return 'new';
  }

  if (normalizedHistoryDepth >= 4) {
    return 'engaged';
  }

  return 'returning';
}

function buildGenericCoachQuestionHints(promptType: CoachGenerationPromptType) {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return cloneCoachQuestionHints(FREE_QUESTION_COACH_HINTS);
  }

  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const definition = getDefaultCoachQuestionDefinition(visiblePromptType);
  if (!definition) {
    throw new Error(`Missing generic coach question hints for "${promptType}"`);
  }

  return cloneCoachQuestionHints(definition);
}

function findCoachQuestionDefinitionByText(
  promptType: CoachGenerationPromptType,
  questionText: string | null | undefined,
) {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return null;
  }

  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const normalizedQuestionText = normalizeCoachQuestionMatchText(questionText);
  if (!normalizedQuestionText) {
    return null;
  }

  const definition =
    getCoachQuestionsForPromptType(visiblePromptType).find((definition) =>
      Object.values(definition.translations).some(
        (translation) =>
          normalizeCoachQuestionMatchText(translation) === normalizedQuestionText,
      ),
    ) ?? null;

  if (definition) {
    return definition;
  }

  const alias =
    COACH_QUESTION_TEXT_ALIASES.find(
      (candidate) =>
        candidate.promptType === visiblePromptType &&
        candidate.normalizedText === normalizedQuestionText,
    ) ?? null;

  return alias ? getCoachQuestionDefinition(alias.key) : null;
}

function scoreCoachQuestionDefinition(
  definition: CoachQuestionDefinition,
  context: CoachQuestionRankingContext,
) {
  let score = 0;
  const tags = new Set(definition.ui_tags ?? []);
  const timeOfDay = context.timeOfDay ?? null;
  const primaryScanType = normalizeCoachQuestionContextScanType(
    context.primaryScanType,
  );
  const historyBand = resolveCoachQuestionHistoryBand(context.historyDepth);

  if (timeOfDay && tags.has(timeOfDay)) {
    score += 8;
  }

  if (definition.meal_slot === 'breakfast' && timeOfDay === 'morning') {
    score += 10;
  }
  if (definition.meal_slot === 'lunch' && timeOfDay === 'midday') {
    score += 10;
  }
  if (definition.meal_slot === 'dinner' && timeOfDay === 'evening') {
    score += 10;
  }

  if (definition.time_scope === 'now' && timeOfDay) {
    score += timeOfDay === 'night' ? 2 : 5;
  }
  if (definition.time_scope === 'tonight' && timeOfDay === 'evening') {
    score += 7;
  }
  if (definition.time_scope === 'today' && timeOfDay && timeOfDay !== 'night') {
    score += 3;
  }
  if (definition.time_scope === 'week' && historyBand !== 'new') {
    score += 2;
  }

  if (primaryScanType === 'super' && tags.has('super_scan')) {
    score += 7;
  }
  if (primaryScanType === 'body' && tags.has('body')) {
    score += 4;
  }
  if (primaryScanType === 'nutrition' && tags.has('nutrition')) {
    score += 4;
  }
  if (primaryScanType === 'face' && tags.has('face')) {
    score += 4;
  }

  if (context.hasSuperScan && tags.has('super_scan')) {
    score += 4;
  }

  if (historyBand === 'new' && tags.has('starter')) {
    score += 6;
  }
  if (historyBand === 'engaged' && tags.has('tracking')) {
    score += 5;
  }
  if (historyBand !== 'new' && tags.has('planning')) {
    score += 4;
  }

  if (tags.has('quick') && timeOfDay && timeOfDay !== 'night') {
    score += 2;
  }
  if (tags.has('recovery') && (timeOfDay === 'evening' || historyBand !== 'new')) {
    score += 2;
  }

  return score;
}

function resolvePresetCoachQuestionHints(key: CoachQuestionKey) {
  return cloneCoachQuestionHints(getCoachQuestionDefinition(key));
}

function classifyLatestScanFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      '10_minutes',
      '10_min',
      'dix_minutes',
      'right_now',
      'maintenant',
      'tout_de_suite',
      'quick_reset',
      'court',
    ])
  ) {
    return resolvePresetCoachQuestionHints('latest_scan__ten_minute_priority');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'eviter',
      'avoid',
      'aggraver',
      'worse',
      'proteger',
      'protect',
      'regression',
    ])
  ) {
    return resolvePresetCoachQuestionHints('latest_scan__avoid_worse_today');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      '3_actions',
      'trois_actions',
      'three_actions',
      '3_things',
      'simple_actions',
    ])
  ) {
    return resolvePresetCoachQuestionHints('latest_scan__three_simple_actions');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'priorite',
      'priority',
      'concentrer',
      'focus',
      'important',
    ])
  ) {
    return resolvePresetCoachQuestionHints('latest_scan__top_priority_today');
  }

  return null;
}

function classifyWeeklyPlanFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'facile',
      'easy',
      'simple',
      'easy_goals',
      'tenable',
      'stick_to',
    ])
  ) {
    return resolvePresetCoachQuestionHints('weekly_plan__seven_day_easy_goals');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'repas',
      'meals',
      'meal',
      'workout',
      'workouts',
      'entrainement',
      'training',
      'energie',
      'energy',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'weekly_plan__organize_meals_workouts',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'burnout',
      'cramer',
      'burning_out',
      'fatigue',
      'recovery',
      'recuperer',
      'recover',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'weekly_plan__progress_without_burning_out',
    );
  }

  return null;
}

function classifyNutritionFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'liste_de_courses',
      'liste_courses',
      'course_minimale',
      'groceries',
      'grocery',
      'shopping_list',
      'shopping',
      'lista_de_compras',
      'spesa',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('nutrition_focus__minimal_three_day_shopping'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'swap',
      'swaps',
      'remplacer',
      'replace',
      'alternative',
      'alternatives',
      'substitute',
      'substitution',
      'troca',
      'cambio',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('nutrition_focus__smart_swaps_week'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'petit_dejeuner',
      'breakfast',
      'fruhstuck',
      'colazione',
      'desayuno',
      'cafe_da_manha',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('nutrition_focus__breakfast_no_crash'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'dejeuner',
      'lunch',
      'mittag',
      'pranzo',
      'almuerzo',
      'almoco',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('nutrition_focus__simple_lunch_balance'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'diner',
      'souper',
      'ce_soir',
      'tonight',
      'dinner',
      'cena',
      'jantar',
      'sera',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('nutrition_focus__light_recovery_dinner'),
    );
  }

  return null;
}

function classifyFaceFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'irrit',
      'irritation',
      'reactive',
      'reactif',
      'sensibl',
      'sensitive',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'face_focus__avoid_irritating_skincare',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'glow',
      'eclat',
      'radiance',
      'luminosite',
    ])
  ) {
    return resolvePresetCoachQuestionHints('face_focus__improve_glow_simple');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'tired',
      'fatigue',
      'tired_look',
      'cernes',
      'under_eye',
    ])
  ) {
    return resolvePresetCoachQuestionHints('face_focus__habits_for_tired_look');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'soir',
      'evening',
      'night',
      'ce_soir',
      'before_bed',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'face_focus__evening_routine_recovery',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'matin',
      'morning',
      'wake_up',
      'reveil',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'face_focus__simple_morning_routine',
    );
  }

  return null;
}

function classifyBodyFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'manque_d_energie',
      'peu_d_energie',
      'sans_energie',
      'low_energy',
      'fatigue',
      'fatigued',
      'tired',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('body_focus__short_session_low_energy'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'mobilite',
      'mobility',
      'posture',
      'stretch',
      'etirements',
      'dos',
      'back',
      'raideur',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('body_focus__mobility_posture_priorities'),
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'reprise',
      'reprendre',
      'restart',
      'comeback',
      'retour',
      'return',
      'pause',
      'days_off',
    ])
  ) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition('body_focus__comeback_after_days_off'),
    );
  }

  return null;
}

function classifyHydrationFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'signal',
      'signes',
      'signaux',
      'urine',
      'thirst',
      'soif',
      'headache',
      'maux_de_tete',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'hydration_focus__hydration_signals',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'sport',
      'training',
      'workout',
      'active_day',
      'bouge',
      'active',
      'heat',
      'chaud',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'hydration_focus__active_day_hydration',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'soir',
      'evening',
      'night',
      'ce_soir',
      'rehydrate',
      'rehydrate',
    ])
  ) {
    return resolvePresetCoachQuestionHints('hydration_focus__rehydrate_tonight');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'matin',
      'morning',
      'anchor',
      'ancrage',
      'wake_up',
      'reveil',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'hydration_focus__morning_anchor_glass',
    );
  }

  return null;
}

function classifySleepFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'big_day',
      'important_day',
      'journee_chargee',
      'sportive',
      'training_day',
      'competition',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'sleep_coach__pre_big_day_bed_protocol',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'afternoon',
      'apres_midi',
      'cafe',
      'caffeine',
      'screen',
      'ecran',
      'late',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'sleep_coach__protect_sleep_from_afternoon',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'wake_up',
      'demain_matin',
      'tomorrow_morning',
      'clearer',
      'plus_clair',
      'despejado',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'sleep_coach__wake_up_clearer_tomorrow',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'tonight',
      'ce_soir',
      'demain',
      'tomorrow',
      'moins_fatigue',
      'less_tired',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'sleep_coach__change_tonight_for_tomorrow',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'routine',
      'soir',
      'evening',
      'wind_down',
      'bedtime',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'sleep_coach__best_evening_routine',
    );
  }

  return null;
}

function classifyRiskFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'log',
      'journal',
      'noter',
      'track_cleanly',
      'suivi',
      'follow_up',
    ])
  ) {
    return resolvePresetCoachQuestionHints('risk_watch__how_to_log_signals');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'today',
      'aujourd_hui',
      'today_only',
      'surveiller_aujourd_hui',
      'focus_today',
    ])
  ) {
    return resolvePresetCoachQuestionHints('risk_watch__what_to_monitor_today');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'change',
      'aggrave',
      'worse',
      'faster_action',
      'plus_vite',
      'react_fast',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'risk_watch__what_change_requires_faster_action',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'avis_pro',
      'professionnel',
      'doctor',
      'medecin',
      'seek_help',
      'seek_professional',
      'consulter',
      'consult',
      'quand_consulter',
      'when_to_seek',
      'when_to_escalate',
      'faut_il_m_inquieter',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'risk_watch__when_to_seek_pro_help',
    );
  }

  return null;
}

function classifyTrendFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAllCoachQuestionPatterns(normalized, ['ameliore', 'bloque']) ||
    includesAllCoachQuestionPatterns(normalized, ['improving', 'blocked']) ||
    includesAllCoachQuestionPatterns(normalized, ['progress', 'continue']) ||
    includesAnyCoachQuestionPattern(normalized, [
      'bilan',
      'review',
      'trend_review',
      'comparison',
      'evolution',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'trend_review__week_progress_review',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'adjust',
      'ajust',
      'changer',
      'change_next',
      'prochaine_action',
      'next_week',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'trend_review__next_adjustment_this_week',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'regression',
      'backslide',
      'rechute',
      'worse_again',
      'derive',
      'drift',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'trend_review__biggest_regression_to_watch',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'bloque',
      'blocked',
      'stuck',
      'plateau',
      'despite',
      'malgre',
      'still_stuck',
    ])
  ) {
    return resolvePresetCoachQuestionHints('trend_review__what_is_stuck');
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'continuer',
      'continue',
      'keep',
      'maintain',
      'maintenir',
      'poursuivre',
      'worth_continuing',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'trend_review__habits_to_continue',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'ameliore',
      'ameliore',
      'improve',
      'improving',
      'progress',
      'progresse',
      'better',
      'mieux',
    ])
  ) {
    return resolvePresetCoachQuestionHints('trend_review__what_is_improving');
  }

  return null;
}

function classifyRecoveryFreeText(questionText: string) {
  const normalized = tokenizeCoachQuestionText(questionText);

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'bad_night',
      'mauvaise_nuit',
      'poor_sleep',
      'mal_dormi',
      'today_after',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'recovery_plan__today_after_bad_night',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      '48h',
      '48_heures',
      'two_days',
      '2_jours',
      'next_48_hours',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'recovery_plan__two_day_recovery_rhythm',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'pause',
      'mettre_en_pause',
      'stop',
      'cut_back',
      'ce_que_je_dois_couper',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'recovery_plan__what_to_pause_for_recovery',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'exces',
      'binge',
      'coup_de_mou',
      'slump',
      'restart',
      'repartir',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'recovery_plan__simple_restart_after_excess',
    );
  }

  if (
    includesAnyCoachQuestionPattern(normalized, [
      'reset',
      'mauvaise_semaine',
      'rough_week',
      'bad_week',
      'recover',
    ])
  ) {
    return resolvePresetCoachQuestionHints(
      'recovery_plan__reset_after_bad_week',
    );
  }

  return null;
}

function classifyFreeTextCoachQuestion(
  promptType: CoachGenerationPromptType,
  questionText: string | null | undefined,
) {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return null;
  }

  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const normalizedQuestionText = normalizeCoachQuestionText(questionText);
  if (!normalizedQuestionText) {
    return null;
  }

  switch (visiblePromptType) {
    case 'latest_scan':
      return classifyLatestScanFreeText(normalizedQuestionText);
    case 'weekly_plan':
      return classifyWeeklyPlanFreeText(normalizedQuestionText);
    case 'nutrition_focus':
      return classifyNutritionFreeText(normalizedQuestionText);
    case 'body_focus':
      return classifyBodyFreeText(normalizedQuestionText);
    case 'face_focus':
      return classifyFaceFreeText(normalizedQuestionText);
    case 'hydration_focus':
      return classifyHydrationFreeText(normalizedQuestionText);
    case 'sleep_coach':
      return classifySleepFreeText(normalizedQuestionText);
    case 'risk_watch':
      return classifyRiskFreeText(normalizedQuestionText);
    case 'recovery_plan':
      return classifyRecoveryFreeText(normalizedQuestionText);
    case 'trend_review':
      return classifyTrendFreeText(normalizedQuestionText);
    default:
      return null;
  }
}

export function normalizeCoachQuestionLocale(
  value: string | null | undefined,
): CoachQuestionLocale {
  const lowered = String(value ?? '').trim().toLowerCase();
  if (lowered.startsWith('fr')) return 'fr';
  if (lowered.startsWith('en')) return 'en';
  if (lowered.startsWith('de')) return 'de';
  if (lowered.startsWith('it')) return 'it';
  if (lowered.startsWith('es')) return 'es';
  if (lowered.startsWith('pt')) return 'pt';
  return 'fr';
}

export function normalizeCoachQuestionText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\r?\n+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

export function isCoachQuestionArtifact(value: unknown): value is CoachQuestionArtifact {
  return typeof value === 'string' && COACH_QUESTION_ARTIFACT_SET.has(value);
}

export function isCoachQuestionIntentKey(
  value: unknown,
): value is CoachQuestionIntentKey {
  return typeof value === 'string' && COACH_QUESTION_INTENT_KEY_SET.has(value);
}

export function isCoachQuestionTimeScope(
  value: unknown,
): value is CoachQuestionTimeScope {
  return typeof value === 'string' && COACH_QUESTION_TIME_SCOPE_SET.has(value);
}

export function isCoachQuestionMealSlot(
  value: unknown,
): value is CoachQuestionMealSlot {
  return typeof value === 'string' && COACH_QUESTION_MEAL_SLOT_SET.has(value);
}

export function getCoachQuestionTimeOfDay(date = new Date()): CoachQuestionTimeOfDay {
  const hour = date.getHours();

  if (hour < 11) {
    return 'morning';
  }
  if (hour < 15) {
    return 'midday';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  if (hour < 23) {
    return 'evening';
  }
  return 'night';
}

export function sanitizeCoachQuestionHints(value: unknown): CoachQuestionHints | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isCoachQuestionIntentKey(candidate.intent_key) ||
    !isCoachQuestionTimeScope(candidate.time_scope)
  ) {
    return null;
  }

  const preferredArtifacts = uniqueCoachQuestionArtifacts(
    candidate.preferred_artifacts,
  );
  if (!preferredArtifacts) {
    return null;
  }

  const discouragedArtifacts =
    candidate.discouraged_artifacts === undefined
      ? undefined
      : uniqueCoachQuestionArtifacts(candidate.discouraged_artifacts);
  if (
    candidate.discouraged_artifacts !== undefined &&
    discouragedArtifacts === null
  ) {
    return null;
  }

  if (
    candidate.meal_slot !== undefined &&
    candidate.meal_slot !== null &&
    !isCoachQuestionMealSlot(candidate.meal_slot)
  ) {
    return null;
  }

  const uiTags =
    candidate.ui_tags === undefined ? undefined : uniqueCoachQuestionTags(candidate.ui_tags);
  if (candidate.ui_tags !== undefined && uiTags === null) {
    return null;
  }

  return {
    intent_key: candidate.intent_key,
    time_scope: candidate.time_scope,
    preferred_artifacts: preferredArtifacts,
    ...(discouragedArtifacts && discouragedArtifacts.length > 0
      ? { discouraged_artifacts: discouragedArtifacts }
      : {}),
    ...(candidate.meal_slot ? { meal_slot: candidate.meal_slot } : {}),
    ...(uiTags && uiTags.length > 0 ? { ui_tags: uiTags } : {}),
  };
}

export function normalizeCoachQuestionKey(
  value: unknown,
): CoachQuestionKey | null {
  return normalizeCoachQuestionKeyString(value);
}

export function isCoachQuestionKey(value: unknown): value is CoachQuestionKey {
  return normalizeCoachQuestionKey(value) !== null;
}

export function getCoachQuestionDefinition(
  key: CoachQuestionKey,
): CoachQuestionDefinition {
  const normalizedKey = normalizeCoachQuestionKey(key);
  if (!normalizedKey) {
    throw new Error(`Unknown coach question key "${String(key)}"`);
  }

  return COACH_QUESTION_MAP.get(normalizedKey)!;
}

export function getCoachQuestionsForPromptType(
  promptType: CoachGenerationPromptType,
): readonly CoachQuestionDefinition[] {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return [];
  }

  return COACH_QUESTIONS_BY_PROMPT.get(resolveVisibleCoachPromptType(promptType)) ?? [];
}

export function rankCoachQuestionsForPromptType(
  promptType: CoachGenerationPromptType,
  context: CoachQuestionRankingContext = {},
): readonly CoachQuestionDefinition[] {
  return [...getCoachQuestionsForPromptType(promptType)].sort((left, right) => {
    const scoreDelta =
      scoreCoachQuestionDefinition(right, context) -
      scoreCoachQuestionDefinition(left, context);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (
      COACH_QUESTION_DEFINITIONS.indexOf(left) -
      COACH_QUESTION_DEFINITIONS.indexOf(right)
    );
  });
}

export function isCoachQuestionForPromptType(
  questionKey: CoachQuestionKey,
  promptType: CoachGenerationPromptType,
): boolean {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return false;
  }

  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const normalizedKey = normalizeCoachQuestionKey(questionKey);
  return (
    normalizedKey !== null &&
    getCoachQuestionDefinition(normalizedKey).promptType === visiblePromptType
  );
}

export function resolveCoachQuestionText(
  questionKey: CoachQuestionKey,
  locale?: string | null,
): string {
  const definition = getCoachQuestionDefinition(questionKey);
  return definition.translations[normalizeCoachQuestionLocale(locale)];
}

export function getDefaultCoachQuestionDefinition(
  promptType: CoachGenerationPromptType,
  context?: CoachQuestionRankingContext,
): CoachQuestionDefinition {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    throw new Error('free_question does not have preset coach questions');
  }

  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const definition = rankCoachQuestionsForPromptType(visiblePromptType, context)[0];
  if (!definition) {
    throw new Error(`Missing default coach question for prompt type "${promptType}"`);
  }

  return definition;
}

export function buildDefaultCoachQuestionSelection(
  promptType: CoachGenerationPromptType,
  locale?: string | null,
  context?: CoachQuestionRankingContext,
) {
  const definition = getDefaultCoachQuestionDefinition(promptType, context);
  return {
    questionKey: definition.key,
    questionText: resolveCoachQuestionText(definition.key, locale),
  };
}

export function resolveCoachQuestionSelection(options: {
  promptType: CoachGenerationPromptType;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
  locale?: string | null;
}) {
  const normalizedQuestionText = normalizeCoachQuestionText(options.questionText);
  if (options.promptType === FREE_QUESTION_PROMPT_TYPE) {
    return {
      questionKey: null,
      questionText: normalizedQuestionText,
    };
  }

  const visiblePromptType = resolveVisibleCoachPromptType(options.promptType);
  const normalizedQuestionKey = normalizeCoachQuestionKey(options.questionKey);
  const hasValidQuestionKey =
    normalizedQuestionKey &&
    isCoachQuestionForPromptType(normalizedQuestionKey, visiblePromptType);

  if (normalizedQuestionText) {
    if (hasValidQuestionKey) {
      const presetQuestionText = resolveCoachQuestionText(
        normalizedQuestionKey,
        options.locale,
      );

      if (normalizedQuestionText === presetQuestionText) {
        return {
          questionKey: normalizedQuestionKey,
          questionText: presetQuestionText,
        };
      }
    }

    return {
      questionKey: null,
      questionText: normalizedQuestionText,
    };
  }

  if (hasValidQuestionKey) {
    return {
      questionKey: normalizedQuestionKey,
      questionText: resolveCoachQuestionText(normalizedQuestionKey, options.locale),
    };
  }

  return buildDefaultCoachQuestionSelection(visiblePromptType, options.locale);
}

export function getCoachWorkflowRouteForIntentKey(
  intentKey: CoachQuestionIntentKey,
): CoachWorkflowRoute {
  return COACH_WORKFLOW_ROUTE_BY_INTENT_KEY[intentKey];
}

export function getDefaultCoachWorkflowRoute(
  promptType: CoachGenerationPromptType,
): CoachWorkflowRoute {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return 'free_question';
  }

  return COACH_WORKFLOW_DEFAULT_ROUTE_BY_PROMPT_TYPE[
    resolveVisibleCoachPromptType(promptType)
  ];
}

export function resolveCoachQuestionHints(options: {
  promptType: CoachGenerationPromptType;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
  locale?: string | null;
}) {
  if (options.promptType === FREE_QUESTION_PROMPT_TYPE) {
    return cloneCoachQuestionHints(FREE_QUESTION_COACH_HINTS);
  }

  const questionSelection = resolveCoachQuestionSelection(options);

  if (questionSelection.questionKey) {
    return cloneCoachQuestionHints(
      getCoachQuestionDefinition(questionSelection.questionKey),
    );
  }

  const matchedPreset = findCoachQuestionDefinitionByText(
    options.promptType,
    questionSelection.questionText,
  );
  if (matchedPreset) {
    return cloneCoachQuestionHints(matchedPreset);
  }

  const classifiedFreeText = classifyFreeTextCoachQuestion(
    options.promptType,
    questionSelection.questionText,
  );
  if (classifiedFreeText) {
    return classifiedFreeText;
  }

  return buildGenericCoachQuestionHints(options.promptType);
}

export function resolveCoachWorkflowRoute(options: {
  promptType: CoachGenerationPromptType;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
  locale?: string | null;
  questionHints?: CoachQuestionHints | null;
}): CoachWorkflowRoute {
  if (options.promptType === FREE_QUESTION_PROMPT_TYPE) {
    return 'free_question';
  }

  const visiblePromptType = resolveVisibleCoachPromptType(options.promptType);
  const questionHints =
    options.questionHints ??
    resolveCoachQuestionHints({
      promptType: options.promptType,
      questionKey: options.questionKey,
      questionText: options.questionText,
      locale: options.locale,
    });

  return (
    (questionHints
      ? COACH_WORKFLOW_ROUTE_BY_INTENT_KEY[questionHints.intent_key]
      : null) ??
    COACH_WORKFLOW_DEFAULT_ROUTE_BY_PROMPT_TYPE[visiblePromptType]
  );
}
