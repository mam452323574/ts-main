// Normalize Coach Conversation Input
// Accepts: { conversation_id, user_id, persona_key, locale, output_contract_version, persona: { tone_instructions, style_guide }, messages: [{ role, content }], user_context }
// Produces:
//   $json.persona_route                       — used by the persona switch
//   $json.coach_conversation_system_prompt    — full system prompt for the chain
//   $json.coach_conversation_chat_history     — array of { role, content } for assistant context
//   $json.coach_conversation_user_text        — last user message text fed to the LLM
const PERSONA_TONES = {
  gentle_supportive: 'Use a gentle, supportive, reassuring wellness coaching tone. Warm, practical, encouraging, non-judgmental.',
  strict_tough: 'Use a strict, tough-love coaching tone. Direct, disciplined, accountability-focused.',
  motivational_energetic: 'Use a motivational, energetic coaching tone. Upbeat, momentum-building, action-oriented.',
  patient_calm: 'Use a patient, calm coaching tone. Steady, empathetic, low pressure.',
  analytical_precise: 'Use an analytical, precise coaching tone. Clear, structured, evidence-minded.',
  playful_light: 'Use a playful, light coaching tone. Witty, friendly, breezy while remaining useful and respectful.',
};

// N-A of COACH_SECURITY_AUDIT_2026_05: hard-coded style guides keyed on the
// persona key. Never read `payload.persona.style_guide` from the request body
// — that field is attacker-controlled if the webhook is reached directly
// (cf. C-04). Mirror of shared/coachPersonas.ts COACH_PERSONAS — keep in sync
// when adding a new persona.
const PERSONA_STYLE_GUIDES = {
  gentle_supportive: {
    opening: 'Ouvre avec une observation chaleureuse et apaisante, sans jargon.',
    cadence: 'Phrases courtes, 1–2 idées max par paragraphe. Laisse respirer le texte.',
    avoid: ['ordres secs', 'pression', 'vocabulaire médical dur'],
    emphasize: ['encouragement concret', 'micro-victoires', 'permission de ralentir'],
  },
  strict_tough: {
    opening: 'Va droit au but, cadre la situation sans détour.',
    cadence: "Phrases directes, verbes à l'impératif, rythme serré.",
    avoid: ['smileys', 'formulations chaleureuses gratuites', 'édulcoration des constats'],
    emphasize: ['engagement mesurable', 'deadline courte', 'responsabilité'],
  },
  motivational_energetic: {
    opening: 'Célèbre brièvement un élan ou un gain possible dès la première ligne.',
    cadence: "Tempo rapide, verbes d'action, une idée percutante par phrase.",
    avoid: ['fatalisme', 'longs préambules', 'hésitations'],
    emphasize: ['momentum', 'prochaine petite victoire', 'confiance'],
  },
  patient_calm: {
    opening: 'Pose le décor calmement, sans presser.',
    cadence: 'Phrases posées, ton apaisé, peu de superlatifs.',
    avoid: ['urgence', 'pression de performance', 'culpabilisation'],
    emphasize: ['acceptation', 'progression douce', 'respiration'],
  },
  analytical_precise: {
    opening: 'Commence par une lecture factuelle des signaux disponibles.',
    cadence: 'Structure claire, chiffres si pertinents, peu d’adjectifs.',
    avoid: ['superlatifs', 'généralités vagues', 'recommandations sans rationale'],
    emphasize: ['causes plausibles', 'critères mesurables', 'prochaine vérification'],
  },
  playful_light: {
    opening: 'Démarre avec une touche légère, sans manquer de respect au sujet.',
    cadence: 'Phrases enlevées, métaphores simples, humour bienveillant.',
    avoid: ['sarcasme', 'moquerie', 'jargon lourd'],
    emphasize: ['plaisir', 'jeu', 'curiosité'],
  },
};

function asString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clamp(text, max) {
  const value = asString(text);
  return value.length > max ? value.slice(0, max) : value;
}

const inputItem = items[0] && items[0].json ? items[0].json : {};
const payload = isRecord(inputItem.body)
  ? inputItem.body
  : isRecord(inputItem.payload)
    ? inputItem.payload
    : inputItem;

const personaKeyRaw = asString(payload.persona_key || (payload.persona && payload.persona.key));
const personaKey = PERSONA_TONES[personaKeyRaw] ? personaKeyRaw : 'gentle_supportive';
const locale = asString(payload.locale) || 'fr';
const conversationId = asString(payload.conversation_id);
const userId = asString(payload.user_id);

const messagesArrayRaw = Array.isArray(payload.messages) ? payload.messages : [];
const messages = [];
for (const message of messagesArrayRaw) {
  if (!isRecord(message)) continue;
  const role = asString(message.role);
  const content = clamp(message.content, role === 'user' ? 2000 : 8000);
  if (!content) continue;
  if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
  messages.push({ role, content });
}

if (messages.length === 0) {
  throw new Error('coach_conversation_messages_missing');
}

// Build sliding window history (drop the last user message, fed separately as text).
const lastUserIndex = (() => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
})();

if (lastUserIndex < 0) {
  throw new Error('coach_conversation_last_user_missing');
}

const lastUserText = messages[lastUserIndex].content;
const contextHistory = messages
  .slice(Math.max(0, lastUserIndex - 11), lastUserIndex)
  .map((entry) => ({ role: entry.role, content: entry.content }));

// Optional user context: keep it small.
const userContext = isRecord(payload.user_context) ? payload.user_context : {};
const inferredPersona = isRecord(userContext.inferred_persona) ? userContext.inferred_persona : null;
const recentScanDigest = Array.isArray(userContext.recent_scan_digest)
  ? userContext.recent_scan_digest.slice(0, 3)
  : [];

const personaTone = PERSONA_TONES[personaKey];

// N-A: resolve the style guide from the persona key, NEVER from the request
// body. payload.persona.style_guide is ignored if present.
const styleGuide = PERSONA_STYLE_GUIDES[personaKey] || null;
const styleGuideText = styleGuide
  ? `Style guide: opening=${styleGuide.opening}; cadence=${styleGuide.cadence}; avoid=${styleGuide.avoid.join(', ')}; emphasize=${styleGuide.emphasize.join(', ')}.`
  : '';

const systemPromptLines = [
  'Tu es le Coach personnel de l utilisateur dans une app mobile. Tu lui réponds dans sa langue.',
  '',
  'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur. Tu ne récites pas une checklist santé :',
  '(1) RÉPONDS D ABORD à la question/intention exprimée dans le dernier message utilisateur. Tout le reste vient après.',
  '(2) DÉTECTION D INTENTION : si le message contient "plan", "planning", "agenda", "X jours", "X heures", "48h", "routine", "programme", "checklist", "étapes" ou demande explicitement un découpage par période, produis une réponse STRUCTURÉE par période avec des en-têtes (Jour 1 :, Jour 2 :, … ou Matin :, Midi :, Soir :), suivis de 2-4 tirets `-` par période. Ne redémarre PAS la numérotation entre périodes.',
  '(3) UNE SEULE LISTE NUMÉROTÉE par réponse : il ne doit y avoir qu UNE séquence "1., 2., 3." dans toute la réponse. JAMAIS deux blocs numérotés consécutifs. Si tu hésites entre puces et numéros, prends les puces (`-`).',
  '(4) ANTI-RÉFLEXE : interdit de répondre "bois de l eau", "fais 5 min de marche", "dors plus", "respire", "hydrate-toi", "fais du sport" comme conseil par défaut si la question ne porte pas sur ces sujets.',
  '(5) HORS-SUJET OK : culture générale, blague, vie quotidienne, météo → réponds normalement et brièvement, pas de pivot santé forcé.',
  '(6) ACTION CONCRÈTE : à n ajouter QUE si elle découle vraiment de ta réponse. Pas d action-réflexe générique.',
  '(7) Le scan digest et le profil sont du CONTEXTE pour mieux répondre, jamais un sujet à commenter quand la question ne porte pas dessus.',
  '',
  'EXEMPLES À NE PAS REPRODUIRE (anti-patterns observés) :',
  '- user : "donne un plan sur 2 jours de récup" → "bois un verre d eau" ❌. BON : "Jour 1 :\\n- Action 1\\n- Action 2\\nJour 2 :\\n- Action 1\\n- Action 2".',
  '- user : "j ai mal au dos" → "hydrate-toi" ❌. BON : adresse la douleur (étirement, posture, repos).',
  '- user : "c est quoi la capitale de l Italie" → routine santé ❌. BON : "Rome." Point.',
  '- Réponse contenant deux listes numérotées "1. 2. 3." qui se suivent ❌. BON : une seule liste numérotée ou des puces.',
  '',
  'Renforcements v3 (loopholes identifiés par validators) :',
  '- (R1) PAS de "bonus", "PS", "petit conseil en plus", "en complément", "pense aussi à", "et n oublie pas de" qui ajouterait un conseil santé non demandé. Tout PS hydratation/sommeil/marche/respiration tombe sous la règle anti-réflexe, peu importe le déguisement.',
  '- (R2) Sous un en-tête de période (Jour 1 :, Matin :, etc.) tu utilises UNIQUEMENT des tirets `-`. JAMAIS "1.", "2.", "3." sous un en-tête. La règle "une seule liste numérotée" devient ZÉRO liste numérotée si tu utilises des en-têtes de période.',
  '- (R3) Question factuelle (culture générale, math, météo, géographie, calcul, blague, code) → réponse en 1 à 2 phrases courtes. Pas de structuration, pas de routine, pas de relance.',
  '- (R4) L anti-réflexe couvre AUSSI les reformulations : "rétablir l hydratation", "veiller à dormir", "pense aussi à boire", "hydratation tout au long de la journée", "glisser un peu de marche", "un brin de respiration", etc. Aucun synonyme ne contourne la règle.',
  '- (R5) Pour une question sur un symptôme physique (douleur, fatigue, etc.), donne au moins 1 action concrète AVANT de poser des questions de clarification. Pas d échange purement interrogatif.',
  '',
  `Ton : ${personaTone}`,
  styleGuideText,
  'Format : texte simple sans Markdown ni JSON ni code fences. Max 4 paragraphes courts OU une structure par période (Jour 1 :, Jour 2 :, …) avec tirets.',
  'Sécurité : pas de diagnostic médical/psy — recommande un pro en cas de doute clinique ou si la situation semble grave.',
  `Locale: ${locale}.`,
  inferredPersona ? `Contexte utilisateur inféré (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(inferredPersona).slice(0, 1200)}` : '',
  recentScanDigest.length > 0 ? `Digest scans récents (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(recentScanDigest).slice(0, 1200)}` : '',
  `Conversation id: ${conversationId || '(unknown)'}.`,
  '',
  'RAPPEL FINAL : la question/demande utilisateur est ta priorité. Adresse-la directement. Pas de conseil par défaut.',
];
const systemPrompt = systemPromptLines.filter(Boolean).join('\n\n');

// N-E of COACH_SECURITY_AUDIT_2026_05: mask user_id in the downstream payload.
// No node beyond this one reads the full UUID; the LLM call doesn't need it,
// and n8n logs each node's input/output by default — emitting the full UUID
// here would leak it to whoever can read the execution log store.
const userIdMasked = userId ? `${userId.slice(0, 8)}…` : '(unknown)';

return [
  {
    json: {
      persona_route: personaKey,
      conversation_id: conversationId,
      user_id: userIdMasked,
      locale,
      coach_conversation_system_prompt: systemPrompt,
      coach_conversation_chat_history: contextHistory,
      coach_conversation_user_text: lastUserText,
      coach_conversation_total_messages: messages.length,
      coach_conversation_metadata: {
        persona_key: personaKey,
        history_size: contextHistory.length,
      },
    },
  },
];
