const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  'app',
  'components',
  'constants',
  'contexts',
  'hooks',
  'i18n',
  'screens',
  'services',
  path.join('supabase', 'functions'),
  'utils',
  'website',
];
const TARGET_FILES = ['app.json', 'eas.json', 'package.json'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.sql',
  '.mjs',
]);
const CP1252_FOLLOWER_CLASS =
  '[\\u0080-\\u00FF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]';
const SUSPICIOUS_PATTERN = new RegExp(
  `(?:\\u00C3(?=${CP1252_FOLLOWER_CLASS})|\\u00C2(?=${CP1252_FOLLOWER_CLASS}|\\s)|\\u00C5(?=${CP1252_FOLLOWER_CLASS})|\\u00E2(?=${CP1252_FOLLOWER_CLASS})|\\u00F0(?=${CP1252_FOLLOWER_CLASS})|\\uFFFD)`,
  'u'
);

const findings = [];

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    scanFile(fullPath);
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!SUSPICIOUS_PATTERN.test(line)) {
      return;
    }

    findings.push({
      filePath,
      line: index + 1,
      snippet: line.trim(),
    });
  });
}

for (const dir of TARGET_DIRS) {
  walk(path.join(ROOT, dir));
}

for (const file of TARGET_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    scanFile(fullPath);
  }
}

if (findings.length > 0) {
  console.error('Potential mojibake detected:');
  for (const finding of findings) {
    const relativePath = path.relative(ROOT, finding.filePath);
    console.error(`${relativePath}:${finding.line}: ${finding.snippet}`);
  }
  process.exit(1);
}

console.log('No mojibake signatures found.');
