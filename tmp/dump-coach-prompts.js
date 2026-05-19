// Run Determine Coach Route + Normalize Coach Conversation Input with a few
// representative payloads and dump the resulting system/user prompts to
// tmp/coach-prompts-after.txt for manual inspection.
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const COACH = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'workflows', 'coach.json'), 'utf8'));
const CONVO = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'workflows', 'coach-conversation.json'), 'utf8'));

function getNode(wf, name) {
  return wf.nodes.find((n) => n.name === name);
}

function runCoachRoute(payload, upstreamJson = null) {
  const jsCode = getNode(COACH, 'Determine Coach Route').parameters.jsCode;
  const fn = new Function('$json', '$', jsCode);
  return fn(payload, () => ({ item: { json: upstreamJson || {} } }));
}

function runConvo(payload) {
  const jsCode = getNode(CONVO, 'Normalize Coach Conversation Input').parameters.jsCode;
  const items = [{ json: payload }];
  const fn = new Function('items', jsCode);
  return fn(items);
}

const samples = [
  {
    label: 'free_question | gentle | "Quelle est la capitale de l Italie ?"',
    out: runCoachRoute({
      payload: { prompt_type: 'free_question', question_text: 'Quelle est la capitale de l Italie ?' },
      scan_context: { has_any_scan: true, primary_scan: { scan_type: 'body' } },
      persona_key: 'gentle_supportive',
      language: 'fr',
    }),
  },
  {
    label: 'free_question | strict | "Je manque de motivation, aide-moi a repartir."',
    out: runCoachRoute({
      payload: { prompt_type: 'free_question', question_text: 'Je manque de motivation, aide-moi a repartir.' },
      scan_context: { has_any_scan: true, primary_scan: { scan_type: 'body' } },
      persona_key: 'strict_tough',
      language: 'fr',
    }),
  },
  {
    label: 'latest_scan | analytical | (no user question)',
    out: runCoachRoute({
      payload: { prompt_type: 'latest_scan' },
      scan_context: { has_any_scan: true, primary_scan: { scan_type: 'body' } },
      persona_key: 'analytical_precise',
      language: 'fr',
    }),
  },
];

const convoSamples = [
  {
    label: 'conversation | gentle | "Quelle est la capitale de l Italie ?"',
    out: runConvo({
      conversation_id: 'c1',
      user_id: 'u1',
      persona_key: 'gentle_supportive',
      locale: 'fr',
      messages: [{ role: 'user', content: 'Quelle est la capitale de l Italie ?' }],
    }),
  },
  {
    label: 'conversation | playful | "Donne-moi ta meilleure blague."',
    out: runConvo({
      conversation_id: 'c2',
      user_id: 'u2',
      persona_key: 'playful_light',
      locale: 'fr',
      messages: [{ role: 'user', content: 'Donne-moi ta meilleure blague.' }],
    }),
  },
];

const sep = '\n' + '='.repeat(80) + '\n';
let out = '';
for (const s of samples) {
  out += sep + s.label + sep;
  const j = s.out[0].json;
  out += '--- coach_prompt_system_text ---\n' + j.coach_prompt_system_text + '\n\n';
  out += '--- coach_prompt_user_text ---\n' + j.coach_prompt_user_text + '\n';
}
for (const s of convoSamples) {
  out += sep + s.label + sep;
  const j = s.out[0].json;
  out += '--- coach_conversation_system_prompt ---\n' + j.coach_conversation_system_prompt + '\n\n';
  out += '--- coach_conversation_user_text ---\n' + j.coach_conversation_user_text + '\n';
}

const outPath = path.join(ROOT, 'tmp', 'coach-prompts-after.txt');
fs.writeFileSync(outPath, out);
console.log('wrote', outPath, '(' + (out.length / 1024).toFixed(1) + ' KB)');
