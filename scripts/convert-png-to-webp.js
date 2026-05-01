#!/usr/bin/env node
/**
 * Conversion ponctuelle PNG -> WebP pour les assets coach + gamification.
 * Usage: node scripts/convert-png-to-webp.js
 *
 * - Lit chaque .png d'un dossier source
 * - Ecrit un .webp avec qualite parametrable
 * - Supprime ensuite le .png original (les backups sont deja dans assets/_backup_png/)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TARGETS = [
  { dir: path.join(__dirname, '..', 'assets', 'images', 'coach'), quality: 85 },
  { dir: path.join(__dirname, '..', 'assets', 'images', 'gamification'), quality: 80 },
];

async function convertOne(pngPath, quality) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  const beforeStat = fs.statSync(pngPath);
  await sharp(pngPath)
    .webp({ quality, effort: 6 })
    .toFile(webpPath);
  const afterStat = fs.statSync(webpPath);
  fs.unlinkSync(pngPath);
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
    const entries = fs.readdirSync(target.dir).filter((f) => /\.png$/i.test(f));
    console.log(`\n=== ${target.dir} (${entries.length} files, q=${target.quality}) ===`);
    for (const entry of entries) {
      const pngPath = path.join(target.dir, entry);
      const result = await convertOne(pngPath, target.quality);
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
