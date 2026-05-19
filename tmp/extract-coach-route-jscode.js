// Extract the jsCode from "Determine Coach Route" + "Normalize Coach Input1" nodes
// of n8n/workflows/coach.json into readable .js files so we can inspect & redesign them.
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(process.cwd(), 'n8n', 'workflows', 'coach.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

const nodesToExtract = [
  'Determine Coach Route',
  'Normalize Coach Input1',
  'Code in JavaScript2',
];

for (const name of nodesToExtract) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) {
    console.error('missing node:', name);
    continue;
  }
  const code = node.parameters && node.parameters.jsCode;
  if (typeof code !== 'string') {
    console.error('no jsCode for node:', name);
    continue;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const outPath = path.join(process.cwd(), 'tmp', `coach-${slug}.js`);
  fs.writeFileSync(outPath, code);
  const lines = code.split('\n').length;
  const kb = (code.length / 1024).toFixed(1);
  console.log(`wrote ${outPath} (${lines} lines, ${kb} KB)`);
}
