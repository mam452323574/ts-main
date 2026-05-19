// Finish v3 — only patches coach-conversation.json (coach.json already done).
// Uses a literal anchor (no escape ambiguity).
const fs = require('fs');
const path = require('path');

const CONVO = path.join(process.cwd(), 'n8n', 'workflows', 'coach-conversation.json');
const V3_MARKER = 'Renforcements v3 (loopholes identifiés par validators)';

const CONVO_ANCHOR =
  '\'- Réponse contenant deux listes numérotées "1. 2. 3." qui se suivent ❌. BON : une seule liste numérotée ou des puces.\',\n' +
  '  \'\',\n' +
  '  `Ton : ${personaTone}`,';

const REINFORCEMENT =
  '  \'\',\n' +
  '  \'Renforcements v3 (loopholes identifiés par validators) :\',\n' +
  '  \'- (R1) PAS de "bonus", "PS", "petit conseil en plus", "en complément", "pense aussi à", "et n oublie pas de" qui ajouterait un conseil santé non demandé. Tout PS hydratation/sommeil/marche/respiration tombe sous la règle anti-réflexe, peu importe le déguisement.\',\n' +
  '  \'- (R2) Sous un en-tête de période (Jour 1 :, Matin :, etc.) tu utilises UNIQUEMENT des tirets `-`. JAMAIS "1.", "2.", "3." sous un en-tête. La règle "une seule liste numérotée" devient ZÉRO liste numérotée si tu utilises des en-têtes de période.\',\n' +
  '  \'- (R3) Question factuelle (culture générale, math, météo, géographie, calcul, blague, code) → réponse en 1 à 2 phrases courtes. Pas de structuration, pas de routine, pas de relance.\',\n' +
  '  \'- (R4) L anti-réflexe couvre AUSSI les reformulations : "rétablir l hydratation", "veiller à dormir", "pense aussi à boire", "hydratation tout au long de la journée", "glisser un peu de marche", "un brin de respiration", etc. Aucun synonyme ne contourne la règle.\',\n' +
  '  \'- (R5) Pour une question sur un symptôme physique (douleur, fatigue, etc.), donne au moins 1 action concrète AVANT de poser des questions de clarification. Pas d échange purement interrogatif.\',\n' +
  '  \'\',';

const CONVO_INSERT =
  '\'- Réponse contenant deux listes numérotées "1. 2. 3." qui se suivent ❌. BON : une seule liste numérotée ou des puces.\',\n' +
  REINFORCEMENT + '\n' +
  '  `Ton : ${personaTone}`,';

const wf = JSON.parse(fs.readFileSync(CONVO, 'utf8'));
const node = wf.nodes.find((n) => n.name === 'Normalize Coach Conversation Input');
let code = node.parameters.jsCode;
if (code.includes(V3_MARKER)) {
  console.log('  [skip] v3 already in coach-conversation.json');
  process.exit(0);
}
const idx = code.indexOf(CONVO_ANCHOR);
if (idx === -1) {
  console.error('anchor not found');
  process.exit(1);
}
const last = code.lastIndexOf(CONVO_ANCHOR);
if (last !== idx) {
  console.error('anchor ambiguous');
  process.exit(1);
}
code = code.slice(0, idx) + CONVO_INSERT + code.slice(idx + CONVO_ANCHOR.length);
node.parameters.jsCode = code;
fs.writeFileSync(CONVO, JSON.stringify(wf, null, 2) + '\n');
console.log('  [ok] coach-conversation.json v3 reinforcements injected');
