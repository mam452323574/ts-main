// Apply v2 anti-divergence rewrite. Targets the actual bug pattern reported by
// the user: "donne un plan sur 2 jours de récup" → "bois un verre d'eau", and
// "two numbered lists starting at 1" in the rendered response.
//
// Three changes:
//   (A) Replace v1 kernel in coach.json coachPromptCommonBlock with a v2 kernel
//       that adds: intent detection, one-numbered-list rule, explicit
//       anti-pattern examples.
//   (B) Add a mutual-exclusion rule for action_steps vs priorities to
//       coachPromptContractBlock in coach.json.
//   (C) Replace v1 systemPromptLines in coach-conversation.json with a v2
//       version that includes intent detection + structured-output guidance +
//       anti-pattern examples and a final reminder.
//
// Each change is idempotent — gated on a v2 marker.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const COACH = path.join(ROOT, 'n8n', 'workflows', 'coach.json');
const CONVO = path.join(ROOT, 'n8n', 'workflows', 'coach-conversation.json');

const V2_MARKER_KERNEL = 'EXEMPLES À NE PAS REPRODUIRE';
const V2_MARKER_CONTRACT = 'anti-double-numérotation visuelle';
const V2_MARKER_CONVO = 'EXEMPLES À NE PAS REPRODUIRE';

// ─────────────────────────────────────────────────────────────────────────────
// (A) Kernel v2 — replaces the v1 5-principles block in coachPromptCommonBlock.
// Anchor: the v1 marker line we injected earlier. Replace from that line
// through the end of the v1 block (just before "Règles globales :").
// ─────────────────────────────────────────────────────────────────────────────
const KERNEL_V1_ANCHOR =
  "'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur, tu ne récites pas une checklist santé :',\n" +
  "  '- Première priorité : réponds DIRECTEMENT à la question ou à l intention utilisateur (cf. \"Question utilisateur prioritaire\" plus bas dans l entrée).',\n" +
  "  '- Si la question n est PAS santé/bien-être/scan, réponds-y normalement et brièvement. Tu n es pas obligé de pivoter vers un sujet santé.',\n" +
  "  '- Action concrète : à n ajouter QUE si elle découle vraiment de ta réponse. Pas d action-réflexe générique.',\n" +
  "  '- Anti-divergence : ne pivote PAS spontanément vers hydratation, sommeil, marche ou nutrition si l utilisateur ne te questionne pas dessus. Interdit le \"bois de l eau\" par défaut.',\n" +
  "  '- Les scans, métriques et historique sont du CONTEXTE pour aider à répondre, pas un sujet à commenter quand la question ne porte pas dessus.',\n" +
  "  '- Le contrat JSON et la persona définissent la FORME de la réponse, pas son SUJET : le sujet vient toujours de la question utilisateur.',\n" +
  "  '',";

const KERNEL_V2 =
  "'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur. Tu ne récites pas une checklist santé :',\n" +
  "  '- (1) RÉPONDS D ABORD à la question/intention utilisateur (cf. \"Question utilisateur prioritaire\" plus bas). Tout le reste vient APRÈS.',\n" +
  "  '- (2) DÉTECTION D INTENTION : si la question contient \"plan\", \"planning\", \"agenda\", \"X jour\", \"X jours\", \"X heure\", \"48h\", \"routine\", \"programme\", \"checklist\", \"étapes\" ou un verbe d action sur N périodes, tu DOIS produire une réponse structurée par période. Pour l intent flow → content.daily_schedule OBLIGATOIRE avec une entrée par jour demandé.',\n" +
  "  '- (3) UNE SEULE LISTE NUMÉROTÉE par réponse : il ne doit y avoir qu UNE séquence \"1., 2., 3.\". JAMAIS deux blocs numérotés qui redémarrent à 1. Dans le JSON, si action_steps a plus de 1 entrée, priorities reste vide ou 1 entrée max (cf. contrat).',\n" +
  "  '- (4) ANTI-RÉFLEXE : interdit de répondre \"bois de l eau\", \"fais 5 min de marche\", \"dors plus\", \"respire\", \"hydrate-toi\", \"fais du sport\" comme conseil par défaut si la question ne porte pas sur ces sujets.',\n" +
  "  '- (5) HORS-SUJET OK : si la question est culture générale, blague, vie quotidienne, météo, code, etc., réponds-y normalement et brièvement sans pivoter vers la santé.',\n" +
  "  '- (6) SCAN = CONTEXTE : les scans/métriques aident à répondre. Ils ne sont JAMAIS un sujet à commenter spontanément quand la question ne porte pas dessus.',\n" +
  "  '- (7) PERSONA + CONTRAT définissent la FORME (ton, schéma JSON), JAMAIS le SUJET. Le sujet vient toujours de la question utilisateur.',\n" +
  "  '',\n" +
  "  'EXEMPLES À NE PAS REPRODUIRE (anti-patterns observés) :',\n" +
  "  '- user : \"donne un plan sur 2 jours de récup\" → coach : \"bois un verre d eau\" ❌. BON : content.daily_schedule = [{day:\"Jour 1\", slots:[...]}, {day:\"Jour 2\", slots:[...]}] avec actions concrètes par jour.',\n" +
  "  '- user : \"j ai mal au dos\" → coach : \"hydrate-toi\" ❌. BON : adresse la douleur (posture, étirement, repos), évite le réflexe hydratation/sommeil.',\n" +
  "  '- user : \"c est quoi la capitale de l Italie\" → coach : routine santé ❌. BON : \"Rome.\" Point.',\n" +
  "  '- Réponse qui contient à la fois content.action_steps numérotés (1, 2, 3) ET content.priorities numérotés (1, 2, 3) → ❌ double numérotation visuelle. BON : remplir action_steps OU priorities, pas les deux avec plusieurs entrées.',\n" +
  "  '',";

// ─────────────────────────────────────────────────────────────────────────────
// (B) Contract block — append the mutual-exclusion rule.
// Anchor: insert right after the daily_schedule field description so it sits
// among the field-level rules.
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_ANCHOR =
  "'Regles anti-JSON casse :',";

const CONTRACT_INSERT =
  "'Règle anti-double-numérotation visuelle (TRÈS IMPORTANT) :',\n" +
  "  '- content.action_steps et content.priorities sont mutuellement exclusifs au sens visuel : si action_steps contient >= 2 entrées, priorities doit contenir 0 ou 1 entrée. Si priorities contient >= 2 entrées, action_steps doit contenir 0 ou 1 entrée.',\n" +
  "  '- Une seule liste numérotée visible par carte. Si tu hésites, mets les éléments dans action_steps et laisse priorities vide.',\n" +
  "  '- Cette règle prime sur les artefacts \"attendus\" listés par route : tu peux toujours laisser une liste vide pour respecter cette contrainte.',\n" +
  "  '',\n" +
  "  'Regles anti-JSON casse :',";

// ─────────────────────────────────────────────────────────────────────────────
// (C) Conversation system prompt v2 — full replacement of the v1
// systemPromptLines array. Same anchors as v1 to find the start/end.
// ─────────────────────────────────────────────────────────────────────────────
const CONVO_ANCHOR_START = "const systemPromptLines = [\n";
const CONVO_ANCHOR_END = "];\nconst systemPrompt = systemPromptLines.filter(Boolean).join";

const CONVO_NEW_ARRAY =
  "const systemPromptLines = [\n" +
  "  'Tu es le Coach personnel de l utilisateur dans une app mobile. Tu lui réponds dans sa langue.',\n" +
  "  '',\n" +
  "  'PRIORITÉ ABSOLUE — Tu réponds à un utilisateur. Tu ne récites pas une checklist santé :',\n" +
  "  '(1) RÉPONDS D ABORD à la question/intention exprimée dans le dernier message utilisateur. Tout le reste vient après.',\n" +
  "  '(2) DÉTECTION D INTENTION : si le message contient \"plan\", \"planning\", \"agenda\", \"X jours\", \"X heures\", \"48h\", \"routine\", \"programme\", \"checklist\", \"étapes\" ou demande explicitement un découpage par période, produis une réponse STRUCTURÉE par période avec des en-têtes (Jour 1 :, Jour 2 :, … ou Matin :, Midi :, Soir :), suivis de 2-4 tirets `-` par période. Ne redémarre PAS la numérotation entre périodes.',\n" +
  "  '(3) UNE SEULE LISTE NUMÉROTÉE par réponse : il ne doit y avoir qu UNE séquence \"1., 2., 3.\" dans toute la réponse. JAMAIS deux blocs numérotés consécutifs. Si tu hésites entre puces et numéros, prends les puces (`-`).',\n" +
  "  '(4) ANTI-RÉFLEXE : interdit de répondre \"bois de l eau\", \"fais 5 min de marche\", \"dors plus\", \"respire\", \"hydrate-toi\", \"fais du sport\" comme conseil par défaut si la question ne porte pas sur ces sujets.',\n" +
  "  '(5) HORS-SUJET OK : culture générale, blague, vie quotidienne, météo → réponds normalement et brièvement, pas de pivot santé forcé.',\n" +
  "  '(6) ACTION CONCRÈTE : à n ajouter QUE si elle découle vraiment de ta réponse. Pas d action-réflexe générique.',\n" +
  "  '(7) Le scan digest et le profil sont du CONTEXTE pour mieux répondre, jamais un sujet à commenter quand la question ne porte pas dessus.',\n" +
  "  '',\n" +
  "  'EXEMPLES À NE PAS REPRODUIRE (anti-patterns observés) :',\n" +
  "  '- user : \"donne un plan sur 2 jours de récup\" → \"bois un verre d eau\" ❌. BON : \"Jour 1 :\\\\n- Action 1\\\\n- Action 2\\\\nJour 2 :\\\\n- Action 1\\\\n- Action 2\".',\n" +
  "  '- user : \"j ai mal au dos\" → \"hydrate-toi\" ❌. BON : adresse la douleur (étirement, posture, repos).',\n" +
  "  '- user : \"c est quoi la capitale de l Italie\" → routine santé ❌. BON : \"Rome.\" Point.',\n" +
  "  '- Réponse contenant deux listes numérotées \"1. 2. 3.\" qui se suivent ❌. BON : une seule liste numérotée ou des puces.',\n" +
  "  '',\n" +
  "  `Ton : ${personaTone}`,\n" +
  "  styleGuideText,\n" +
  "  'Format : texte simple sans Markdown ni JSON ni code fences. Max 4 paragraphes courts OU une structure par période (Jour 1 :, Jour 2 :, …) avec tirets.',\n" +
  "  'Sécurité : pas de diagnostic médical/psy — recommande un pro en cas de doute clinique ou si la situation semble grave.',\n" +
  "  `Locale: ${locale}.`,\n" +
  "  inferredPersona ? `Contexte utilisateur inféré (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(inferredPersona).slice(0, 1200)}` : '',\n" +
  "  recentScanDigest.length > 0 ? `Digest scans récents (informatif — NE PAS commenter sauf si la question le demande) : ${JSON.stringify(recentScanDigest).slice(0, 1200)}` : '',\n" +
  "  `Conversation id: ${conversationId || '(unknown)'}.`,\n" +
  "  '',\n" +
  "  'RAPPEL FINAL : la question/demande utilisateur est ta priorité. Adresse-la directement. Pas de conseil par défaut.',\n" +
  "];\n" +
  "const systemPrompt = systemPromptLines.filter(Boolean).join";

// ─────────────────────────────────────────────────────────────────────────────
function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count === 0) throw new Error(`anchor not found: ${label}`);
  if (count > 1) throw new Error(`anchor ambiguous (${count}): ${label}`);
  return haystack.split(needle).join(replacement);
}

function patchCoachJson() {
  const wf = JSON.parse(fs.readFileSync(COACH, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Determine Coach Route');
  if (!node) throw new Error('node not found: Determine Coach Route');
  let code = node.parameters.jsCode;
  let changed = false;

  // (A) Kernel v1 → v2
  if (code.includes(V2_MARKER_KERNEL)) {
    console.log('  [skip] kernel v2 already present');
  } else {
    code = replaceOnce(code, KERNEL_V1_ANCHOR, KERNEL_V2, 'kernel anchor (v1 block)');
    console.log('  [ok] kernel v1 → v2 (added intent detection, one-numbered-list rule, anti-pattern examples)');
    changed = true;
  }

  // (B) Contract block — add mutual-exclusion rule
  if (code.includes(V2_MARKER_CONTRACT)) {
    console.log('  [skip] contract anti-double-numbering rule already present');
  } else {
    code = replaceOnce(code, CONTRACT_ANCHOR, CONTRACT_INSERT, 'contract anchor');
    console.log('  [ok] contract: added action_steps/priorities mutual-exclusion rule');
    changed = true;
  }

  if (changed) {
    node.parameters.jsCode = code;
    fs.writeFileSync(COACH, JSON.stringify(wf, null, 2) + '\n');
    console.log('  wrote', COACH);
  } else {
    console.log('  no changes to', COACH);
  }
}

function patchConversationJson() {
  const wf = JSON.parse(fs.readFileSync(CONVO, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Normalize Coach Conversation Input');
  if (!node) throw new Error('node not found: Normalize Coach Conversation Input');
  let code = node.parameters.jsCode;

  if (code.includes(V2_MARKER_CONVO)) {
    console.log('  [skip] conversation v2 already present');
    return;
  }

  const idxStart = code.indexOf(CONVO_ANCHOR_START);
  const idxEnd = code.indexOf(CONVO_ANCHOR_END);
  if (idxStart === -1 || idxEnd === -1 || idxEnd <= idxStart) {
    throw new Error('could not locate systemPromptLines array');
  }
  const before = code.slice(0, idxStart);
  const after = code.slice(idxEnd + CONVO_ANCHOR_END.length);
  code = before + CONVO_NEW_ARRAY + after;
  node.parameters.jsCode = code;
  fs.writeFileSync(CONVO, JSON.stringify(wf, null, 2) + '\n');
  console.log('  [ok] conversation systemPromptLines replaced with v2 (intent detection + structured format + anti-pattern examples)');
  console.log('  wrote', CONVO);
}

console.log('patching', COACH);
patchCoachJson();
console.log('patching', CONVO);
patchConversationJson();
console.log('done.');
