import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const QUALITY = 88;
const EFFORT = 6;
const THEMES = ['light', 'dark'];
const SLIDES = ['scanner', 'coach', 'social', 'analytics', 'fridge'];
const LOCALES = ['fr', 'en', 'de', 'it', 'es', 'pt'];

function sourceExtension(locale) {
  return locale === 'fr' ? 'jpeg' : 'png';
}

async function main() {
  let generatedCount = 0;
  let sourceBytes = 0;
  let outputBytes = 0;

  for (const theme of THEMES) {
    for (const slide of SLIDES) {
      for (const locale of LOCALES) {
        const directory = path.join(
          process.cwd(),
          'assets',
          'onboarding',
          theme,
          slide,
        );
        const sourcePath = path.join(
          directory,
          `${locale}.${sourceExtension(locale)}`,
        );
        const outputPath = path.join(directory, `${locale}.webp`);

        if (!existsSync(sourcePath)) {
          throw new Error(`Missing localized onboarding source: ${sourcePath}`);
        }

        sourceBytes += statSync(sourcePath).size;
        await sharp(sourcePath)
          .webp({ quality: QUALITY, effort: EFFORT })
          .toFile(outputPath);
        outputBytes += statSync(outputPath).size;
        generatedCount += 1;

        console.log(`generated ${path.relative(process.cwd(), outputPath)}`);
      }
    }
  }

  const sourceMb = (sourceBytes / 1024 / 1024).toFixed(2);
  const outputMb = (outputBytes / 1024 / 1024).toFixed(2);
  console.log(
    `Generated ${generatedCount} localized WebP assets: ${sourceMb} MB -> ${outputMb} MB.`,
  );
}

main().catch((error) => {
  console.error('[generate-onboarding-localized-webp] Failed:', error);
  process.exitCode = 1;
});
