// Apply the 5-principles + anti-divergence rewrite to:
//   - n8n/workflows/coach.json  (Determine Coach Route node)
//   - n8n/workflows/coach-conversation.json  (Normalize Coach Conversation Input node)
//
// Strategy: load the JSON, mutate the jsCode strings by anchored string
// replacements (no regex on giant strings), write back. Idempotent: each
// replacement is gated by checking the marker isn't already present.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const COACH_PATH = path.join(ROOT, 'n8n', 'workflows', 'coach.json');
const CONVO_PATH = path.join(ROOT, 'n8n', 'workflows', 'coach-conversation.json');

// ---------------------------------------------------------------------------
// MARKERS — used both to inject and to detect that injection already happened
// ---------------------------------------------------------------------------
const MARKER_COMMON = 'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur';
const MARKER_FREE_Q = 'C est une question libre. Tu DOIS répondre à la question posée';
const MARKER_CONVO = 'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur';

// ---------------------------------------------------------------------------
// 1. coachPromptCommonBlock — insert 5-principles section right after the
//    intro lines, before "Règles globales".
// ---------------------------------------------------------------------------
const COMMON_ANCHOR =
  "'Utilise le contexte normalisé pour générer une réponse de coaching non médical, claire, concrète, courte et adaptée au mobile.',\n  '',\n  'Règles globales :',";

const COMMON_INSERT =
  "'Utilise le contexte normalisé pour générer une réponse de coaching non médical, claire, concrète, courte et adaptée au mobile.',\n" +
  "  '',\n" +
  "  'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur, tu ne récites pas une checklist santé :',\n" +
  "  '- Première priorité : réponds DIRECTEMENT à la question ou à l intention utilisateur (cf. \"Question utilisateur prioritaire\" plus bas dans l entrée).',\n" +
  "  '- Si la question n est PAS santé/bien-être/scan, réponds-y normalement et brièvement. Tu n es pas obligé de pivoter vers un sujet santé.',\n" +
  "  '- Action concrète : à n ajouter QUE si elle découle vraiment de ta réponse. Pas d action-réflexe générique.',\n" +
  "  '- Anti-divergence : ne pivote PAS spontanément vers hydratation, sommeil, marche ou nutrition si l utilisateur ne te questionne pas dessus. Interdit le \"bois de l eau\" par défaut.',\n" +
  "  '- Les scans, métriques et historique sont du CONTEXTE pour aider à répondre, pas un sujet à commenter quand la question ne porte pas dessus.',\n" +
  "  '- Le contrat JSON et la persona définissent la FORME de la réponse, pas son SUJET : le sujet vient toujours de la question utilisateur.',\n" +
  "  '',\n" +
  "  'Règles globales :',";

// ---------------------------------------------------------------------------
// 2. free_question route block — prepend stronger anti-divergence directives.
// ---------------------------------------------------------------------------
const FREE_Q_ANCHOR =
  "  free_question: joinLines([\n    'Prompt specialise - free_question :',\n    '- Objectif : repondre directement a la question libre de l utilisateur, sans la reclassifier en latest_scan, nutrition, body, face ou autre mode.',";

const FREE_Q_INSERT =
  "  free_question: joinLines([\n    'Prompt specialise - free_question :',\n" +
  "    'PRIORITÉ : C est une question libre. Tu DOIS répondre à la question posée. Tu n as PAS le droit de pivoter vers un sujet non demandé.',\n" +
  "    '- Hors santé (culture générale, blague, vie quotidienne, météo, code, etc.) : réponds-y simplement, brièvement, sans pivot santé forcé. La réponse va dans content.summary, action_steps reste vide.',\n" +
  "    '- Santé / bien-être : réponds précisément à la question, puis ajoute 1 à 4 actions UNIQUEMENT si elles sont directement utiles à la question.',\n" +
  "    '- Question vide / trop vague : demande UNE clarification courte (1 phrase) dans content.summary au lieu de partir dans un conseil générique. action_steps reste vide.',\n" +
  "    'Interdictions explicites :',\n" +
  "    '- Interdit de suggérer \"bois de l eau\" / \"fais 5 min de marche\" / \"dors plus\" / \"respire\" / \"hydrate-toi\" comme conseil par défaut si la question ne porte pas sur ces sujets.',\n" +
  "    '- Interdit de basculer la réponse sur le dernier scan si l utilisateur ne pose pas de question dessus.',\n" +
  "    '- Interdit de \"reformuler\" la question en autre chose pour la rapprocher d un thème santé connu.',\n" +
  "    '',\n" +
  "    '- Objectif : repondre directement a la question libre de l utilisateur, sans la reclassifier en latest_scan, nutrition, body, face ou autre mode.',";

// ---------------------------------------------------------------------------
// 3. coach-conversation.json systemPromptLines — full replacement of the array.
// ---------------------------------------------------------------------------
const CONVO_ANCHOR_START = "const systemPromptLines = [\n";
const CONVO_ANCHOR_END = "];\nconst systemPrompt = systemPromptLines.filter(Boolean).join";

const CONVO_NEW_ARRAY =
  "const systemPromptLines = [\n" +
  "  'Tu es le Coach personnel de l utilisateur dans une app mobile. Tu lui réponds dans sa langue.',\n" +
  "  '',\n" +
  "  'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur, tu ne récites pas une checklist santé :',\n" +
  "  '- Première priorité : réponds DIRECTEMENT à la question ou à l intention exprimée dans le dernier message utilisateur.',\n" +
  "  '- Si la question n est PAS santé/bien-être/scan, réponds-y normalement et brièvement. Pas de pivot forcé vers un sujet santé.',\n" +
  "  '- Action concrète : à n ajouter QUE si elle découle vraiment de ta réponse. Pas d action-réflexe générique.',\n" +
  "  '- Anti-divergence : ne suggère PAS spontanément hydratation, sommeil, marche ou nutrition si l utilisateur ne te questionne pas dessus. Interdit le \"bois de l eau\" par défaut.',\n" +
  "  '- Si la question est vide ou trop vague : demande UNE clarification courte (1 phrase) au lieu de partir dans un conseil générique.',\n" +
  "  '- Le scan digest et le profil sont du CONTEXTE pour mieux répondre, pas un sujet à commenter quand la question ne porte pas dessus.',\n" +
  "  '',\n" +
  "  `Ton : ${personaTone}`,\n" +
  "  styleGuideText,\n" +
  "  'Format : texte simple, max 4 paragraphes courts OU une liste serrée. Pas de Markdown, pas de JSON, pas de code fence.',\n" +
  "  'Sécurité : pas de diagnostic médical ou psychologique. Recommande un professionnel en cas de doute clinique ou si la situation semble grave.',\n" +
  "  `Locale: ${locale}.`,\n" +
  "  inferredPersona ? `Contexte utilisateur inféré (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(inferredPersona).slice(0, 1200)}` : '',\n" +
  "  recentScanDigest.length > 0 ? `Digest scans récents (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(recentScanDigest).slice(0, 1200)}` : '',\n" +
  "  `Conversation id: ${conversationId || '(unknown)'}.`,\n" +
  "];\n" +
  "const systemPrompt = systemPromptLines.filter(Boolean).join";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count === 0) {
    throw new Error(`anchor not found for ${label}`);
  }
  if (count > 1) {
    throw new Error(`anchor ambiguous (${count} hits) for ${label}`);
  }
  return haystack.split(needle).join(replacement);
}

function alreadyApplied(haystack, marker) {
  return haystack.includes(marker);
}

function patchCoachJson() {
  const wf = JSON.parse(fs.readFileSync(COACH_PATH, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Determine Coach Route');
  if (!node) throw new Error('node not found: Determine Coach Route');
  let code = node.parameters.jsCode;

  let changedCommon = false;
  let changedFreeQ = false;

  if (alreadyApplied(code, MARKER_COMMON)) {
    console.log('  [skip] coachPromptCommonBlock: 5-principles section already present');
  } else {
    code = replaceOnce(code, COMMON_ANCHOR, COMMON_INSERT, 'coachPromptCommonBlock');
    changedCommon = true;
    console.log('  [ok] coachPromptCommonBlock: injected 5-principles section');
  }

  if (alreadyApplied(code, MARKER_FREE_Q)) {
    console.log('  [skip] free_question block: anti-divergence directives already present');
  } else {
    code = replaceOnce(code, FREE_Q_ANCHOR, FREE_Q_INSERT, 'free_question block');
    changedFreeQ = true;
    console.log('  [ok] free_question block: prepended anti-divergence directives');
  }

  if (changedCommon || changedFreeQ) {
    node.parameters.jsCode = code;
    fs.writeFileSync(COACH_PATH, JSON.stringify(wf, null, 2) + '\n');
    console.log('  wrote', COACH_PATH);
  } else {
    console.log('  no changes to', COACH_PATH);
  }
}

function patchConversationJson() {
  const wf = JSON.parse(fs.readFileSync(CONVO_PATH, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Normalize Coach Conversation Input');
  if (!node) throw new Error('node not found: Normalize Coach Conversation Input');
  let code = node.parameters.jsCode;

  if (alreadyApplied(code, MARKER_CONVO)) {
    console.log('  [skip] coach-conversation systemPromptLines: 5-principles already present');
    return;
  }

  const idxStart = code.indexOf(CONVO_ANCHOR_START);
  const idxEnd = code.indexOf(CONVO_ANCHOR_END);
  if (idxStart === -1 || idxEnd === -1 || idxEnd <= idxStart) {
    throw new Error('could not locate systemPromptLines array in conversation jsCode');
  }
  const before = code.slice(0, idxStart);
  const after = code.slice(idxEnd + CONVO_ANCHOR_END.length);
  // CONVO_NEW_ARRAY already ends with the CONVO_ANCHOR_END string verbatim
  code = before + CONVO_NEW_ARRAY + after;
  node.parameters.jsCode = code;
  fs.writeFileSync(CONVO_PATH, JSON.stringify(wf, null, 2) + '\n');
  console.log('  [ok] coach-conversation systemPromptLines: replaced array');
  console.log('  wrote', CONVO_PATH);
}

// ---------------------------------------------------------------------------
console.log('patching', COACH_PATH);
patchCoachJson();
console.log('patching', CONVO_PATH);
patchConversationJson();
console.log('done.');
