import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const brandDir = path.join(projectRoot, 'assets', 'brand');
const imagesDir = path.join(projectRoot, 'assets', 'images');
const storeBrandDir = path.join(projectRoot, 'store-assets', 'store-refresh-2026-07', 'brand');

const sourcePaths = {
  icon: path.join(brandDir, 'selflens-icon-v2.svg'),
  foreground: path.join(brandDir, 'selflens-icon-v2-foreground.svg'),
  monochrome: path.join(brandDir, 'selflens-icon-v2-monochrome.svg'),
};

const outputPaths = {
  icon: path.join(imagesDir, 'icon.png'),
  favicon: path.join(imagesDir, 'favicon.png'),
  adaptiveForeground: path.join(imagesDir, 'android-adaptive-foreground.png'),
  adaptiveMonochrome: path.join(imagesDir, 'android-adaptive-monochrome.png'),
  notification: path.join(imagesDir, 'notification-icon.png'),
  splash: path.join(imagesDir, 'splash-icon.png'),
  appStore: path.join(storeBrandDir, 'app-store-icon-1024.png'),
  playStore: path.join(storeBrandDir, 'google-play-icon-512.png'),
  maskPreview: path.join(storeBrandDir, 'icon-mask-preview.png'),
};

async function readSvg(filePath) {
  return fs.readFile(filePath);
}

async function renderOpaque(svgSource, size, outPath) {
  await sharp(svgSource, { density: 288 })
    .resize(size, size, { fit: 'cover' })
    .flatten({ background: '#0D2A64' })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
}

async function renderTransparent(svgSource, size, outPath) {
  await sharp(svgSource, { density: 288 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
}

async function renderPlayStoreIcon(svgSource, outPath) {
  const opaque = await sharp(svgSource, { density: 288 })
    .resize(512, 512, { fit: 'cover' })
    .flatten({ background: '#0D2A64' })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();

  await sharp(opaque)
    .ensureAlpha(1)
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
}

async function renderMaskPreview(iconPath, outPath) {
  const iconData = (await fs.readFile(iconPath)).toString('base64');
  const dataUri = `data:image/png;base64,${iconData}`;
  const previewSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="330" viewBox="0 0 1200 330">
      <rect width="1200" height="330" fill="#F6F6F3"/>
      <defs>
        <clipPath id="circle"><circle cx="150" cy="145" r="112"/></clipPath>
        <clipPath id="squircle"><rect x="330" y="33" width="224" height="224" rx="62"/></clipPath>
        <clipPath id="rounded"><rect x="630" y="33" width="224" height="224" rx="42"/></clipPath>
        <clipPath id="teardrop"><path d="M1042 33c66 0 112 46 112 112v112h-112c-66 0-112-46-112-112S976 33 1042 33Z"/></clipPath>
      </defs>
      <image href="${dataUri}" x="38" y="33" width="224" height="224" clip-path="url(#circle)"/>
      <image href="${dataUri}" x="330" y="33" width="224" height="224" clip-path="url(#squircle)"/>
      <image href="${dataUri}" x="630" y="33" width="224" height="224" clip-path="url(#rounded)"/>
      <image href="${dataUri}" x="930" y="33" width="224" height="224" clip-path="url(#teardrop)"/>
      <g font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#1C1C1E" text-anchor="middle">
        <text x="150" y="300">Circle</text>
        <text x="442" y="300">Squircle</text>
        <text x="742" y="300">Rounded</text>
        <text x="1042" y="300">Teardrop</text>
      </g>
    </svg>`);

  await sharp(previewSvg, { density: 144 })
    .resize(1200, 330)
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
}

async function renderIcons() {
  const [iconSource, foregroundSource, monochromeSource] = await Promise.all([
    readSvg(sourcePaths.icon),
    readSvg(sourcePaths.foreground),
    readSvg(sourcePaths.monochrome),
  ]);

  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(storeBrandDir, { recursive: true });

  await Promise.all([
    renderOpaque(iconSource, 1024, outputPaths.icon),
    renderOpaque(iconSource, 48, outputPaths.favicon),
    renderTransparent(foregroundSource, 1024, outputPaths.adaptiveForeground),
    renderTransparent(monochromeSource, 1024, outputPaths.adaptiveMonochrome),
    renderTransparent(monochromeSource, 96, outputPaths.notification),
    renderTransparent(foregroundSource, 1024, outputPaths.splash),
    renderOpaque(iconSource, 1024, outputPaths.appStore),
    renderPlayStoreIcon(iconSource, outputPaths.playStore),
  ]);

  await renderMaskPreview(outputPaths.icon, outputPaths.maskPreview);

  for (const sourcePath of Object.values(sourcePaths)) {
    console.log(`Source ${path.relative(projectRoot, sourcePath)}`);
  }
  for (const outputPath of Object.values(outputPaths)) {
    console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
  }
}

renderIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
