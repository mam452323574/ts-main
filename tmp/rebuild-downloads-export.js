// Rebuild C:\Users\maloh\Downloads\coach (1).json from the two updated
// source workflows (coach.json + coach-conversation.json).
//
// Strategy: take the existing merged Downloads file as the canonical layout
// (positions, IDs, connections are already laid out correctly) and replace
// the two updated jsCode nodes in place. This preserves everything else
// (DeepSeek credential placeholders, switch rules, webhook IDs, etc.).

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DOWNLOADS = 'C:\\Users\\maloh\\Downloads\\coach (1).json';
const DOWNLOADS_BAK = 'C:\\Users\\maloh\\Downloads\\coach (1).json.bak';

const COACH_SRC = path.join(ROOT, 'n8n', 'workflows', 'coach.json');
const CONVO_SRC = path.join(ROOT, 'n8n', 'workflows', 'coach-conversation.json');

// nodes whose jsCode we need to copy from source → merged downloads file
const NODES_TO_SYNC = [
  { name: 'Determine Coach Route', sourceFile: COACH_SRC },
  { name: 'Normalize Coach Input1', sourceFile: COACH_SRC },
  { name: 'Code in JavaScript2', sourceFile: COACH_SRC },
  { name: 'Normalize Coach Conversation Input', sourceFile: CONVO_SRC },
];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function findNode(wf, name) {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`node not found in ${wf.name}: ${name}`);
  return node;
}

// 1. backup
if (!fs.existsSync(DOWNLOADS_BAK)) {
  fs.copyFileSync(DOWNLOADS, DOWNLOADS_BAK);
  console.log('backed up →', DOWNLOADS_BAK);
} else {
  console.log('backup already exists, leaving untouched →', DOWNLOADS_BAK);
}

// 2. load
const merged = loadJson(DOWNLOADS);
const sources = {
  [COACH_SRC]: loadJson(COACH_SRC),
  [CONVO_SRC]: loadJson(CONVO_SRC),
};

// 3. sync jsCode for each target node
let updated = 0;
for (const { name, sourceFile } of NODES_TO_SYNC) {
  const mergedNode = findNode(merged, name);
  const sourceNode = findNode(sources[sourceFile], name);
  if (typeof sourceNode.parameters.jsCode !== 'string') {
    console.warn(`  no jsCode on source ${name}, skipping`);
    continue;
  }
  const before = mergedNode.parameters.jsCode || '';
  const after = sourceNode.parameters.jsCode;
  if (before === after) {
    console.log(`  [unchanged] ${name}`);
    continue;
  }
  mergedNode.parameters.jsCode = after;
  const beforeKb = (before.length / 1024).toFixed(1);
  const afterKb = (after.length / 1024).toFixed(1);
  console.log(`  [updated] ${name}: ${beforeKb} KB → ${afterKb} KB`);
  updated += 1;
}

// 4. write back
if (updated === 0) {
  console.log('nothing to write.');
} else {
  fs.writeFileSync(DOWNLOADS, JSON.stringify(merged, null, 2) + '\n');
  console.log(`wrote ${DOWNLOADS} (${updated} node${updated > 1 ? 's' : ''} updated)`);
}
