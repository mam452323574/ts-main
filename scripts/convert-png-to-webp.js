#!/usr/bin/env node
/**
 * Conversion ponctuelle PNG -> WebP pour les assets lourds affiches dans l'app.
 * Usage: node scripts/convert-png-to-webp.js
 *
 * - Lit les .png cibles
 * - Ecrit un .webp avec qualite parametrable
 * - Conserve les .png originaux pour une passe sure et reversible
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TARGETS = [
  {
    dir: path.join(__dirname, '..', 'assets', 'images', 'coach'),
    quality: 85,
    skipExisting: true,
  },
  {
    dir: path.join(__dirname, '..', 'assets', 'images', 'gamification'),
    quality: 80,
    skipExisting: true,
  },
  {
    dir: path.join(__dirname, '..', 'assets', 'images', 'chef'),
    quality: 84,
    files: [
      'chef-home-dietetique.png',
      'chef-home-sportif.png',
      'chef-home-gourmand.png',
    ],
  },
  {
    dir: path.join(__dirname, '..', 'assets', 'onboarding'),
    quality: 82,
    recursive: true,
    include: (pngPath) => path.basename(pngPath).toLowerCase() === 'hero.png',
  },
];

function collectPngPaths(target) {
  if (!fs.existsSync(target.dir)) {
    return [];
  }

  if (Array.isArray(target.files)) {
    return target.files
      .map((file) => path.join(target.dir, file))
      .filter((pngPath) => fs.existsSync(pngPath));
  }

  const output = [];
  const visit = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (target.recursive) {
          visit(entryPath);
        }
        return;
      }

      if (!/\.png$/i.test(entry.name)) {
        return;
      }

      if (target.include && !target.include(entryPath)) {
        return;
      }

      output.push(entryPath);
    });
  };

  visit(target.dir);
  return output;
}

async function convertOne(pngPath, quality, options = {}) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  if (options.skipExisting && fs.existsSync(webpPath)) {
    return {
      file: path.basename(pngPath),
      skipped: true,
    };
  }

  const beforeStat = fs.statSync(pngPath);
  await sharp(pngPath)
    .webp({ quality, effort: 6 })
    .toFile(webpPath);
  const afterStat = fs.statSync(webpPath);

  return {
    file: path.basename(pngPath),
    before: beforeStat.size,
    after: afterStat.size,
    saved: beforeStat.size - afterStat.size,
  };
}

async function main() {
  let totalBefore = 0;
  let totalAfter = 0;

  for (const target of TARGETS) {
    if (!fs.existsSync(target.dir)) {
      console.warn(`Skip (missing dir): ${target.dir}`);
      continue;
    }
    const entries = collectPngPaths(target);
    console.log(`\n=== ${target.dir} (${entries.length} files, q=${target.quality}) ===`);
    for (const pngPath of entries) {
      const result = await convertOne(pngPath, target.quality, {
        skipExisting: target.skipExisting,
      });

      if (result.skipped) {
        console.log(`  ${result.file}: skipped (webp already exists)`);
        continue;
      }

      totalBefore += result.before;
      totalAfter += result.after;
      const beforeKb = (result.before / 1024).toFixed(1);
      const afterKb = (result.after / 1024).toFixed(1);
      const ratio = ((1 - result.after / result.before) * 100).toFixed(1);
      console.log(`  ${result.file}: ${beforeKb} KB -> ${afterKb} KB (-${ratio}%)`);
    }
  }

  const totalBeforeMb = (totalBefore / 1024 / 1024).toFixed(2);
  const totalAfterMb = (totalAfter / 1024 / 1024).toFixed(2);
  const savedMb = ((totalBefore - totalAfter) / 1024 / 1024).toFixed(2);
  console.log(`\nTotal: ${totalBeforeMb} MB -> ${totalAfterMb} MB (saved ${savedMb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
