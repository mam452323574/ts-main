/* eslint-disable no-console */
/**
 * Codemod: rewrite <View> / <Pressable> tags that carry a borderRadius
 * into <Squircle> / <SquirclePressable> from @/components/Squircle.
 *
 * - Skips tags whose effective borderRadius is "pill" (>= 999 or BORDER_RADIUS.{pill,full,button,tag}).
 * - Skips namespaced JSX (e.g. Animated.View, Reanimated.Pressable).
 * - Logs files / tags it could not handle for manual review.
 *
 * Usage:
 *   npx tsx scripts/migrate-squircles.ts          # apply
 *   npx tsx scripts/migrate-squircles.ts --dry    # report only
 */

import path from 'node:path';
import {
  Project,
  SyntaxKind,
  Node,
  type SourceFile,
  type ObjectLiteralExpression,
  type CallExpression,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type JsxAttribute,
  type ArrayLiteralExpression,
} from 'ts-morph';

const PILL_PROPERTY_NAMES = new Set(['pill', 'full', 'button', 'tag']);
const PILL_THRESHOLD = 999;

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
const SQUIRCLE_IMPORT_SOURCE = '@/components/Squircle';
const SQUIRCLE_IMPORT_NAMES = new Set(['Squircle', 'SquirclePressable']);

const DRY_RUN = process.argv.includes('--dry');

interface KeyMeta {
  hasRadius: boolean;
  isPill: boolean;
}

interface FileReport {
  file: string;
  viewToSquircle: number;
  pressableToSquirclePressable: number;
  pillSkipped: number;
  manualReviewNotes: string[];
}

type StyleKeyTable = Map<string, KeyMeta>;

/* ---------- Pill / radius detection on expressions ---------- */

function detectPillFromValue(node: Node): boolean {
  if (Node.isNumericLiteral(node)) {
    return Number(node.getText()) >= PILL_THRESHOLD;
  }
  if (Node.isPropertyAccessExpression(node)) {
    const exprText = node.getExpression().getText();
    const name = node.getName();
    if (exprText.endsWith('BORDER_RADIUS') && PILL_PROPERTY_NAMES.has(name)) return true;
    return false;
  }
  if (Node.isPrefixUnaryExpression(node)) {
    return detectPillFromValue(node.getOperand());
  }
  if (Node.isParenthesizedExpression(node)) {
    return detectPillFromValue(node.getExpression());
  }
  if (Node.isBinaryExpression(node)) {
    // e.g. BORDER_RADIUS.xl + 10 → not a pill unless one side is pill
    return detectPillFromValue(node.getLeft()) || detectPillFromValue(node.getRight());
  }
  return false;
}

function detectRadiusPropertiesOnObject(obj: ObjectLiteralExpression): KeyMeta {
  let hasRadius = false;
  let isPill = false;
  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const name = prop.getName();
    if (
      name === 'borderRadius' ||
      name === 'borderTopLeftRadius' ||
      name === 'borderTopRightRadius' ||
      name === 'borderBottomLeftRadius' ||
      name === 'borderBottomRightRadius'
    ) {
      hasRadius = true;
      const init = prop.getInitializer();
      if (init && detectPillFromValue(init)) {
        isPill = true;
      }
    }
  }
  return { hasRadius, isPill };
}

/* ---------- StyleSheet.create / inline object discovery ---------- */

function collectStyleSheetKeys(sourceFile: SourceFile): StyleKeyTable {
  const table: StyleKeyTable = new Map();

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const call = node as CallExpression;
    const expr = call.getExpression();
    const text = expr.getText();
    if (text !== 'StyleSheet.create' && text !== 'create') return;
    if (text === 'create') {
      // Be conservative — only accept if there's a StyleSheet identifier nearby
      const parent = expr.getFirstAncestorByKind(SyntaxKind.PropertyAccessExpression);
      if (!parent) return;
    }
    const args = call.getArguments();
    if (args.length === 0) return;
    const firstArg = args[0];
    if (!Node.isObjectLiteralExpression(firstArg)) return;

    for (const prop of firstArg.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;
      const name = prop.getName();
      const init = prop.getInitializer();
      if (!init || !Node.isObjectLiteralExpression(init)) continue;
      const meta = detectRadiusPropertiesOnObject(init);
      if (meta.hasRadius) {
        table.set(name, meta);
      }
    }
  });

  return table;
}

/* ---------- JSX style-prop analysis ---------- */

interface StylePropAnalysis {
  hasRadius: boolean;
  isPill: boolean;
  unknown: boolean; // we saw a style ref we couldn't introspect
}

function analyzeStyleReference(node: Node, keys: StyleKeyTable): StylePropAnalysis {
  // styles.card / styles['card']
  if (Node.isPropertyAccessExpression(node)) {
    const expr = node.getExpression().getText();
    const name = node.getName();
    if (expr === 'styles') {
      const meta = keys.get(name);
      if (meta) return { hasRadius: true, isPill: meta.isPill, unknown: false };
      return { hasRadius: false, isPill: false, unknown: false };
    }
    return { hasRadius: false, isPill: false, unknown: true };
  }
  if (Node.isElementAccessExpression(node)) {
    const expr = node.getExpression().getText();
    if (expr === 'styles') {
      const arg = node.getArgumentExpression();
      if (arg && Node.isStringLiteral(arg)) {
        const meta = keys.get(arg.getLiteralText());
        if (meta) return { hasRadius: true, isPill: meta.isPill, unknown: false };
        return { hasRadius: false, isPill: false, unknown: false };
      }
    }
    return { hasRadius: false, isPill: false, unknown: true };
  }
  if (Node.isObjectLiteralExpression(node)) {
    const meta = detectRadiusPropertiesOnObject(node);
    return { hasRadius: meta.hasRadius, isPill: meta.isPill, unknown: false };
  }
  if (Node.isConditionalExpression(node)) {
    const a = analyzeStyleReference(node.getWhenTrue(), keys);
    const b = analyzeStyleReference(node.getWhenFalse(), keys);
    return {
      hasRadius: a.hasRadius || b.hasRadius,
      isPill: a.isPill || b.isPill,
      unknown: a.unknown || b.unknown,
    };
  }
  if (Node.isBinaryExpression(node)) {
    // styles.foo && styles.bar
    const a = analyzeStyleReference(node.getLeft(), keys);
    const b = analyzeStyleReference(node.getRight(), keys);
    return {
      hasRadius: a.hasRadius || b.hasRadius,
      isPill: a.isPill || b.isPill,
      unknown: a.unknown || b.unknown,
    };
  }
  if (Node.isParenthesizedExpression(node)) {
    return analyzeStyleReference(node.getExpression(), keys);
  }
  if (Node.isAsExpression(node) || Node.isTypeAssertion(node)) {
    return analyzeStyleReference(node.getExpression(), keys);
  }
  if (Node.isSpreadElement(node)) {
    return analyzeStyleReference(node.getExpression(), keys);
  }
  // Identifiers, function calls, etc → unknown
  return { hasRadius: false, isPill: false, unknown: true };
}

function analyzeStyleProp(
  attr: JsxAttribute,
  keys: StyleKeyTable,
): StylePropAnalysis {
  const initializer = attr.getInitializer();
  if (!initializer) return { hasRadius: false, isPill: false, unknown: false };
  if (!Node.isJsxExpression(initializer)) return { hasRadius: false, isPill: false, unknown: true };
  const expr = initializer.getExpression();
  if (!expr) return { hasRadius: false, isPill: false, unknown: false };

  if (Node.isArrayLiteralExpression(expr)) {
    const arr = expr as ArrayLiteralExpression;
    let hasRadius = false;
    let isPill = false;
    let unknown = false;
    for (const el of arr.getElements()) {
      const r = analyzeStyleReference(el, keys);
      if (r.hasRadius) hasRadius = true;
      if (r.isPill) isPill = true;
      if (r.unknown) unknown = true;
    }
    return { hasRadius, isPill, unknown };
  }

  return analyzeStyleReference(expr, keys);
}

/* ---------- JSX rewriting (deferred text replacements) ---------- */

interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

function tagNameOf(opening: JsxOpeningElement | JsxSelfClosingElement): string {
  return opening.getTagNameNode().getText();
}

function isTargetTag(tagName: string): 'view' | 'pressable' | null {
  if (tagName === 'View') return 'view';
  if (tagName === 'Pressable') return 'pressable';
  return null;
}

function getStyleAttribute(
  opening: JsxOpeningElement | JsxSelfClosingElement,
): JsxAttribute | undefined {
  for (const attr of opening.getAttributes()) {
    if (Node.isJsxAttribute(attr) && attr.getNameNode().getText() === 'style') {
      return attr;
    }
  }
  return undefined;
}

function collectTagRenameEdits(
  opening: JsxOpeningElement | JsxSelfClosingElement,
  parent: Node | undefined,
  newName: string,
  edits: TextEdit[],
): void {
  const openingTagName = opening.getTagNameNode();
  edits.push({
    start: openingTagName.getStart(),
    end: openingTagName.getEnd(),
    newText: newName,
  });
  if (Node.isJsxElement(parent)) {
    const closingTagName = parent.getClosingElement().getTagNameNode();
    edits.push({
      start: closingTagName.getStart(),
      end: closingTagName.getEnd(),
      newText: newName,
    });
  }
}

function collectSquircleImportEdit(
  sourceFile: SourceFile,
  needed: Set<string>,
  edits: TextEdit[],
): void {
  if (needed.size === 0) return;

  const existing = sourceFile.getImportDeclaration(SQUIRCLE_IMPORT_SOURCE);
  if (existing) {
    const already = new Set(existing.getNamedImports().map((n) => n.getName()));
    const toAdd: string[] = [];
    for (const name of needed) {
      if (!already.has(name)) toAdd.push(name);
    }
    if (toAdd.length === 0) return;

    const namedImportsNode = existing.getImportClause()?.getNamedBindings();
    if (namedImportsNode && Node.isNamedImports(namedImportsNode)) {
      const elements = namedImportsNode.getElements();
      if (elements.length === 0) {
        // empty braces, just replace entirely
        edits.push({
          start: namedImportsNode.getStart(),
          end: namedImportsNode.getEnd(),
          newText: `{ ${toAdd.join(', ')} }`,
        });
      } else {
        const last = elements[elements.length - 1];
        edits.push({
          start: last.getEnd(),
          end: last.getEnd(),
          newText: `, ${toAdd.join(', ')}`,
        });
      }
    }
    return;
  }

  // No existing import — insert a new line after the last import in the file
  const lastImport = sourceFile.getImportDeclarations().slice(-1)[0];
  const importLine = `import { ${Array.from(needed).join(', ')} } from '${SQUIRCLE_IMPORT_SOURCE}';\n`;
  if (lastImport) {
    edits.push({
      start: lastImport.getEnd(),
      end: lastImport.getEnd(),
      newText: `\n${importLine}`.replace(/\n$/, ''),
    });
  } else {
    edits.push({
      start: 0,
      end: 0,
      newText: importLine,
    });
  }
}

function applyEdits(originalText: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = originalText;
  for (const edit of sorted) {
    out = out.slice(0, edit.start) + edit.newText + out.slice(edit.end);
  }
  return out;
}

/* ---------- File processing ---------- */

function shouldProcessFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.endsWith('.tsx')) return false;
  for (const frag of EXCLUDE_FRAGMENTS) {
    if (normalized.includes(`/${frag}/`)) return false;
  }
  // Don't process the Squircle components themselves
  if (normalized.endsWith('/components/Squircle.tsx')) return false;
  if (normalized.endsWith('/components/SquirclePressable.tsx')) return false;
  return true;
}

function processFile(sourceFile: SourceFile): FileReport {
  const report: FileReport = {
    file: path.relative(PROJECT_ROOT, sourceFile.getFilePath()),
    viewToSquircle: 0,
    pressableToSquirclePressable: 0,
    pillSkipped: 0,
    manualReviewNotes: [],
  };

  const styleKeys = collectStyleSheetKeys(sourceFile);
  if (styleKeys.size === 0) return report;

  const needed = new Set<string>();
  const edits: TextEdit[] = [];

  sourceFile.forEachDescendant((node) => {
    let opening: JsxOpeningElement | JsxSelfClosingElement | null = null;
    let parent: Node | undefined;

    if (Node.isJsxElement(node)) {
      opening = node.getOpeningElement();
      parent = node;
    } else if (Node.isJsxSelfClosingElement(node)) {
      opening = node;
    } else {
      return;
    }

    const tagName = tagNameOf(opening);
    const kind = isTargetTag(tagName);
    if (!kind) return;

    const styleAttr = getStyleAttribute(opening);
    if (!styleAttr) return;

    const analysis = analyzeStyleProp(styleAttr, styleKeys);
    if (!analysis.hasRadius) return;
    if (analysis.isPill) {
      report.pillSkipped += 1;
      return;
    }
    if (analysis.unknown) {
      const line = opening.getStartLineNumber();
      report.manualReviewNotes.push(`L${line}: <${tagName}> with non-trivial style ref`);
      return;
    }

    const newName = kind === 'view' ? 'Squircle' : 'SquirclePressable';
    collectTagRenameEdits(opening, parent, newName, edits);
    needed.add(newName);
    if (kind === 'view') report.viewToSquircle += 1;
    else report.pressableToSquirclePressable += 1;
  });

  if (needed.size > 0) {
    collectSquircleImportEdit(sourceFile, needed, edits);
    const originalText = sourceFile.getFullText();
    const newText = applyEdits(originalText, edits);
    if (newText !== originalText) {
      sourceFile.replaceWithText(newText);
    }
  }

  return report;
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const project = new Project({
    tsConfigFilePath: path.join(PROJECT_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  const patterns = SCAN_DIRS.map((d) => path.join(PROJECT_ROOT, d, '**/*.tsx'));
  project.addSourceFilesAtPaths(patterns);

  const allFiles = project.getSourceFiles().filter((sf) => shouldProcessFile(sf.getFilePath()));

  console.log(`[squircle-codemod] scanning ${allFiles.length} .tsx files (dry=${DRY_RUN})`);

  let totalView = 0;
  let totalPressable = 0;
  let totalPillSkipped = 0;
  let changedFiles = 0;
  const filesNeedingReview: FileReport[] = [];

  for (const sourceFile of allFiles) {
    const report = processFile(sourceFile);
    const touched =
      report.viewToSquircle > 0 ||
      report.pressableToSquirclePressable > 0;

    if (touched) changedFiles += 1;
    totalView += report.viewToSquircle;
    totalPressable += report.pressableToSquirclePressable;
    totalPillSkipped += report.pillSkipped;

    if (report.manualReviewNotes.length > 0) {
      filesNeedingReview.push(report);
    }
  }

  if (!DRY_RUN) {
    await project.save();
  }

  console.log('');
  console.log('=== Squircle migration report ===');
  console.log(`  Files scanned                 : ${allFiles.length}`);
  console.log(`  Files modified                : ${changedFiles}`);
  console.log(`  <View>     → <Squircle>          : ${totalView}`);
  console.log(`  <Pressable>→ <SquirclePressable> : ${totalPressable}`);
  console.log(`  Pill tags skipped (kept as View) : ${totalPillSkipped}`);

  if (filesNeedingReview.length > 0) {
    console.log('');
    console.log(`  Files needing manual review: ${filesNeedingReview.length}`);
    for (const r of filesNeedingReview.slice(0, 25)) {
      console.log(`    - ${r.file}`);
      for (const note of r.manualReviewNotes.slice(0, 5)) {
        console.log(`        · ${note}`);
      }
      if (r.manualReviewNotes.length > 5) {
        console.log(`        · (+${r.manualReviewNotes.length - 5} more)`);
      }
    }
    if (filesNeedingReview.length > 25) {
      console.log(`    ... and ${filesNeedingReview.length - 25} more files`);
    }
  }

  console.log('');
  console.log(DRY_RUN ? '(dry run — no files written)' : 'Saved changes to disk.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
