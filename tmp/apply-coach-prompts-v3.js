// v3 reinforcements based on validator findings:
//   - Ban bonus/PS hydration bypass
//   - Disallow numbering under period headers (force dashes only)
//   - Cap factual questions at 1-2 sentences
//   - Cover synonyms of the anti-reflex (any reformulation of hydration/sleep/walk/etc.)
//   - Action-before-clarifying for symptom questions
//
// Applied to BOTH the kernel in coach.json (intent flow) and the
// systemPromptLines in coach-conversation.json (chat flow).

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const COACH = path.join(ROOT, 'n8n', 'workflows', 'coach.json');
const CONVO = path.join(ROOT, 'n8n', 'workflows', 'coach-conversation.json');

const V3_MARKER = 'Renforcements v3 (loopholes identifiés par validators)';

// ─────────────────────────────────────────────────────────────────────────────
// Reinforcement block (5 rules)
// ─────────────────────────────────────────────────────────────────────────────
const REINFORCEMENT_BLOCK_COACH =
  "'',\n" +
  "  'Renforcements v3 (loopholes identifiés par validators) :',\n" +
  "  '- (R1) PAS de \"bonus\", \"PS\", \"petit conseil en plus\", \"en complément\", \"pense aussi à\", \"et n oublie pas de\" qui ajouterait un conseil santé non demandé. Tout PS hydratation/sommeil/marche/respiration tombe sous la règle anti-réflexe, peu importe le déguisement.',\n" +
  "  '- (R2) Sous un en-tête de période (Jour 1 :, Matin :, etc.) tu utilises UNIQUEMENT des tirets `-`. JAMAIS \"1.\", \"2.\", \"3.\" sous un en-tête. La règle \"une seule liste numérotée\" devient ZÉRO liste numérotée si tu utilises des en-têtes de période.',\n" +
  "  '- (R3) Question factuelle (culture générale, math, météo, géographie, calcul, blague, code) → réponse en 1 à 2 phrases courtes. Pas de structuration, pas de routine, pas de relance.',\n" +
  "  '- (R4) L anti-réflexe couvre AUSSI les reformulations : \"rétablir l hydratation\", \"veiller à dormir\", \"pense aussi à boire\", \"hydratation tout au long de la journée\", \"glisser un peu de marche\", \"un brin de respiration\", etc. Aucun synonyme ne contourne la règle.',\n" +
  "  '- (R5) Pour une question sur un symptôme physique (douleur, fatigue, etc.), donne au moins 1 action concrète AVANT de poser des questions de clarification. Pas d échange purement interrogatif.',\n" +
  "  '',";

const REINFORCEMENT_BLOCK_CONVO =
  "  '',\n" +
  "  'Renforcements v3 (loopholes identifiés par validators) :',\n" +
  "  '- (R1) PAS de \"bonus\", \"PS\", \"petit conseil en plus\", \"en complément\", \"pense aussi à\", \"et n oublie pas de\" qui ajouterait un conseil santé non demandé. Tout PS hydratation/sommeil/marche/respiration tombe sous la règle anti-réflexe, peu importe le déguisement.',\n" +
  "  '- (R2) Sous un en-tête de période (Jour 1 :, Matin :, etc.) tu utilises UNIQUEMENT des tirets `-`. JAMAIS \"1.\", \"2.\", \"3.\" sous un en-tête. La règle \"une seule liste numérotée\" devient ZÉRO liste numérotée si tu utilises des en-têtes de période.',\n" +
  "  '- (R3) Question factuelle (culture générale, math, météo, géographie, calcul, blague, code) → réponse en 1 à 2 phrases courtes. Pas de structuration, pas de routine, pas de relance.',\n" +
  "  '- (R4) L anti-réflexe couvre AUSSI les reformulations : \"rétablir l hydratation\", \"veiller à dormir\", \"pense aussi à boire\", \"hydratation tout au long de la journée\", \"glisser un peu de marche\", \"un brin de respiration\", etc. Aucun synonyme ne contourne la règle.',\n" +
  "  '- (R5) Pour une question sur un symptôme physique (douleur, fatigue, etc.), donne au moins 1 action concrète AVANT de poser des questions de clarification. Pas d échange purement interrogatif.',\n" +
  "  '',";

// Anchor: insert immediately after the v2 anti-pattern examples block.
// In coach.json kernel, the v2 anti-pattern examples block ends with a line
// containing "BON : remplir action_steps OU priorities" followed by the empty
// line then "Règles globales".
const COACH_ANCHOR =
  "'- Réponse qui contient à la fois content.action_steps numérotés (1, 2, 3) ET content.priorities numérotés (1, 2, 3) → ❌ double numérotation visuelle. BON : remplir action_steps OU priorities, pas les deux avec plusieurs entrées.',\n" +
  "  '',\n" +
  "  'Règles globales :',";

const COACH_INSERT =
  "'- Réponse qui contient à la fois content.action_steps numérotés (1, 2, 3) ET content.priorities numérotés (1, 2, 3) → ❌ double numérotation visuelle. BON : remplir action_steps OU priorities, pas les deux avec plusieurs entrées.',\n" +
  "  " + REINFORCEMENT_BLOCK_COACH + "\n" +
  "  'Règles globales :',";

// Anchor in conversation: end of v2 anti-pattern block, before persona tone.
const CONVO_ANCHOR =
  "'- Réponse contenant deux listes numérotées \\\"1. 2. 3.\\\" qui se suivent ❌. BON : une seule liste numérotée ou des puces.',\n" +
  "  '',\n" +
  "  `Ton : ${personaTone}`,";

const CONVO_INSERT =
  "'- Réponse contenant deux listes numérotées \\\"1. 2. 3.\\\" qui se suivent ❌. BON : une seule liste numérotée ou des puces.',\n" +
  REINFORCEMENT_BLOCK_CONVO + "\n" +
  "  `Ton : ${personaTone}`,";

// ─────────────────────────────────────────────────────────────────────────────
function replaceOnce(haystack, needle, replacement, label) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) throw new Error(`anchor not found: ${label}`);
  const last = haystack.lastIndexOf(needle);
  if (last !== idx) throw new Error(`anchor ambiguous: ${label}`);
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

function patchCoach() {
  const wf = JSON.parse(fs.readFileSync(COACH, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Determine Coach Route');
  let code = node.parameters.jsCode;
  if (code.includes(V3_MARKER)) {
    console.log('  [skip] v3 already in coach.json');
    return;
  }
  code = replaceOnce(code, COACH_ANCHOR, COACH_INSERT, 'coach kernel anchor');
  node.parameters.jsCode = code;
  fs.writeFileSync(COACH, JSON.stringify(wf, null, 2) + '\n');
  console.log('  [ok] coach.json kernel v3 reinforcements injected');
}

function patchConvo() {
  const wf = JSON.parse(fs.readFileSync(CONVO, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Normalize Coach Conversation Input');
  let code = node.parameters.jsCode;
  if (code.includes(V3_MARKER)) {
    console.log('  [skip] v3 already in coach-conversation.json');
    return;
  }
  code = replaceOnce(code, CONVO_ANCHOR, CONVO_INSERT, 'convo anchor');
  node.parameters.jsCode = code;
  fs.writeFileSync(CONVO, JSON.stringify(wf, null, 2) + '\n');
  console.log('  [ok] coach-conversation.json v3 reinforcements injected');
}

patchCoach();
patchConvo();
console.log('done.');
