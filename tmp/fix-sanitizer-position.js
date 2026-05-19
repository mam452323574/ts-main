#!/usr/bin/env node
// Move the COACH_LLM_REFUSAL_SANITIZER_V1 block from its bad position (after
// enforcePersonaContract, which causes a temporal-dead-zone error because
// `parsedBodySanitized` is referenced earlier in hasMeaningfulContent) to a
// position right after `parsed` is finalized, so the variable is available
// everywhere it is used downstream.
'use strict';

const fs = require('fs');
const path = require('path');

const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      path.resolve(__dirname, '..', 'n8n', 'workflows', 'coach.json'),
      'C:/Users/maloh/Downloads/coach (1).json',
    ];

const MARKER = '/* COACH_LLM_REFUSAL_SANITIZER_V1 */';
const NEW_ANCHOR = 'const rawBodySections = deriveBodySections(parsed.body ?? "", languageCode);';

function extractSanitizerBlock(code) {
  // Find the marker line, then capture until the line `const parsedBodySanitized = ...;` inclusive.
  const startIdx = code.indexOf(MARKER);
  if (startIdx === -1) return null;
  // Find the end: the line declaring parsedBodySanitized assignment
  const endTag = 'const parsedBodySanitized = coachStripLLMRefusal(parsed.body, languageCode);';
  const endIdx = code.indexOf(endTag, startIdx);
  if (endIdx === -1) return null;
  const blockEnd = endIdx + endTag.length;
  // Capture surrounding newlines so removal is clean
  let start = startIdx;
  while (start > 0 && (code[start - 1] === '\n' || code[start - 1] === '\r')) start--;
  let end = blockEnd;
  while (end < code.length && (code[end] === '\n' || code[end] === '\r')) end++;
  return { start, end, block: code.slice(startIdx, blockEnd) };
}

function runOnFile(FILE) {
  if (!fs.existsSync(FILE)) {
    console.log(`[skip] ${FILE} (not found)`);
    return;
  }
  console.log(`\n=== Fixing sanitizer position in ${FILE} ===`);
  const original = fs.readFileSync(FILE, 'utf-8');
  const wf = JSON.parse(original);
  const node = wf.nodes.find((n) => n.name === 'Code in JavaScript2');
  if (!node) {
    console.log('  [warn] Node "Code in JavaScript2" not found — skip');
    return;
  }
  let code = node.parameters.jsCode;

  const extracted = extractSanitizerBlock(code);
  if (!extracted) {
    console.log('  [skip] sanitizer block not found (already moved or not injected)');
    return;
  }

  // Check if already moved (the anchor line is immediately preceded by the marker)
  const anchorIdx = code.indexOf(NEW_ANCHOR);
  if (anchorIdx === -1) {
    console.log('  [warn] new anchor not found');
    return;
  }
  const upToAnchor = code.slice(0, anchorIdx);
  if (upToAnchor.includes('const parsedBodySanitized = coachStripLLMRefusal') && upToAnchor.lastIndexOf('const parsedBodySanitized') > upToAnchor.lastIndexOf('enforcePersonaContract')) {
    console.log('  [skip] sanitizer already positioned before anchor');
    return;
  }

  // 1) Remove the block from its current position
  const before = code.slice(0, extracted.start);
  const after = code.slice(extracted.end);
  let newCode = before + after;

  // 2) Re-insert just before the anchor line
  const newAnchorIdx = newCode.indexOf(NEW_ANCHOR);
  if (newAnchorIdx === -1) {
    throw new Error('anchor disappeared after removing block (this should not happen)');
  }
  newCode =
    newCode.slice(0, newAnchorIdx) +
    extracted.block.trim() + '\n' +
    newCode.slice(newAnchorIdx);

  // Validate JS
  try {
    new Function(newCode);
  } catch (error) {
    throw new Error(`Resulting jsCode invalid: ${error.message}`);
  }

  node.parameters.jsCode = newCode;
  const updated = JSON.stringify(wf, null, 2) + '\n';
  try {
    JSON.parse(updated);
  } catch (error) {
    throw new Error(`Resulting ${FILE} invalid JSON: ${error.message}`);
  }
  fs.writeFileSync(FILE, updated, 'utf-8');
  console.log(`  [ok] sanitizer moved before ${NEW_ANCHOR}`);
}

for (const f of FILES) runOnFile(f);
