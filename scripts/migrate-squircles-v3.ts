/* eslint-disable no-console */
/**
 * Codemod V3: identical to V2 but WITHOUT the pill-skip rule.
 *
 * Injects `borderCurve: 'continuous'` into every style object that has any
 * `borderRadius*` property, INCLUDING pills (radius >= 999). This produces
 * code uniformity — every style with a radius carries the same property —
 * even though borderCurve has no visual effect on a perfect circle / capsule.
 *
 * Idempotent: skips objects that already have borderCurve.
 *
 * Usage:
 *   npx tsx scripts/migrate-squircles-v3.ts          # apply
 *   npx tsx scripts/migrate-squircles-v3.ts --dry    # report only
 */

import path from 'node:path';
import {
  Project,
  Node,
  type SourceFile,
  type ObjectLiteralExpression,
} from 'ts-morph';

const SCAN_DIRS = ['app', 'components', 'screens', 'contexts', 'hooks', 'shared', 'utils'];
const EXCLUDE_FRAGMENTS = [
  'node_modules',
  '__tests__',
  '__mocks__',
  '.expo',
  'dist',
  'android',
  'ios',
  'backups',
  'scripts',
  'supabase',
  'n8n',
  'website',
];

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RADIUS_PROPS = new Set([
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
]);

const DRY_RUN = process.argv.includes('--dry');

interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

interface FileReport {
  file: string;
  injected: number;
  alreadyHadBorderCurve: number;
}

interface ObjectInspection {
  hasRadius: boolean;
  hasBorderCurve: boolean;
  lastPropertyEnd?: number;
  insertAtIfEmpty?: number;
}

function inspectObject(obj: ObjectLiteralExpression): ObjectInspection {
  let hasRadius = false;
  let hasBorderCurve = false;
  const props = obj.getProperties();

  for (const prop of props) {
    if (Node.isPropertyAssignment(prop)) {
      const name = prop.getName();
      if (RADIUS_PROPS.has(name)) hasRadius = true;
      if (name === 'borderCurve') hasBorderCurve = true;
    } else if (Node.isShorthandPropertyAssignment(prop)) {
      const name = prop.getName();
      if (RADIUS_PROPS.has(name)) hasRadius = true;
      if (name === 'borderCurve') hasBorderCurve = true;
    }
  }

  const lastProp = props[props.length - 1];
  return {
    hasRadius,
    hasBorderCurve,
    lastPropertyEnd: lastProp?.getEnd(),
    insertAtIfEmpty: obj.getStart() + 1,
  };
}

function buildInsertion(inspection: ObjectInspection): { position: number; text: string } {
  if (inspection.lastPropertyEnd !== undefined) {
    return {
      position: inspection.lastPropertyEnd,
      text: `, borderCurve: 'continuous'`,
    };
  }
  return {
    position: inspection.insertAtIfEmpty ?? 0,
    text: ` borderCurve: 'continuous' `,
  };
}

function shouldProcessFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.endsWith('.tsx')) return false;
  for (const frag of EXCLUDE_FRAGMENTS) {
    if (normalized.includes(`/${frag}/`)) return false;
  }
  return true;
}

function applyEdits(originalText: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = originalText;
  for (const edit of sorted) {
    out = out.slice(0, edit.start) + edit.newText + out.slice(edit.end);
  }
  return out;
}

function processFile(sourceFile: SourceFile): FileReport {
  const report: FileReport = {
    file: path.relative(PROJECT_ROOT, sourceFile.getFilePath()),
    injected: 0,
    alreadyHadBorderCurve: 0,
  };

  const edits: TextEdit[] = [];

  sourceFile.forEachDescendant((node) => {
    if (!Node.isObjectLiteralExpression(node)) return;

    const inspection = inspectObject(node);
    if (!inspection.hasRadius) return;
    if (inspection.hasBorderCurve) {
      report.alreadyHadBorderCurve += 1;
      return;
    }

    const insertion = buildInsertion(inspection);
    edits.push({
      start: insertion.position,
      end: insertion.position,
      newText: insertion.text,
    });
    report.injected += 1;
  });

  if (edits.length > 0) {
    const originalText = sourceFile.getFullText();
    const newText = applyEdits(originalText, edits);
    if (newText !== originalText) {
      sourceFile.replaceWithText(newText);
    }
  }

  return report;
}

async function main(): Promise<void> {
  const project = new Project({
    tsConfigFilePath: path.join(PROJECT_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  const patterns = SCAN_DIRS.map((d) => path.join(PROJECT_ROOT, d, '**/*.tsx'));
  project.addSourceFilesAtPaths(patterns);

  const allFiles = project.getSourceFiles().filter((sf) => shouldProcessFile(sf.getFilePath()));

  console.log(`[squircle-v3] scanning ${allFiles.length} .tsx files (dry=${DRY_RUN})`);

  let totalInjected = 0;
  let totalAlreadyHad = 0;
  let changedFiles = 0;
  const perFile: FileReport[] = [];

  for (const sourceFile of allFiles) {
    const report = processFile(sourceFile);
    if (report.injected > 0) changedFiles += 1;
    totalInjected += report.injected;
    totalAlreadyHad += report.alreadyHadBorderCurve;
    if (report.injected > 0) {
      perFile.push(report);
    }
  }

  if (!DRY_RUN) {
    await project.save();
  }

  console.log('');
  console.log('=== Squircle V3 (full uniformity, includes pills) report ===');
  console.log(`  Files scanned                       : ${allFiles.length}`);
  console.log(`  Files modified                      : ${changedFiles}`);
  console.log(`  Style objects with borderCurve added: ${totalInjected}`);
  console.log(`  Already had borderCurve (skipped)   : ${totalAlreadyHad}`);
  console.log('');

  const topFiles = [...perFile].sort((a, b) => b.injected - a.injected).slice(0, 15);
  if (topFiles.length > 0) {
    console.log('Top 15 files by injections:');
    for (const r of topFiles) {
      console.log(`  ${r.injected.toString().padStart(3)} → ${r.file}`);
    }
  }

  console.log('');
  console.log(DRY_RUN ? '(dry run — no files written)' : 'Saved changes to disk.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
