import fs from 'node:fs';
import path from 'node:path';

const sharp = require('sharp');

type ManifestItem = {
  lang: 'fr' | 'en';
  platform: string;
  slug: string;
  path: string;
  width: number;
  height: number;
};

describe('localized store refresh assets', () => {
  const root = process.cwd();
  const manifestPath = path.join(
    root,
    'store-assets',
    'store-refresh-2026-07',
    'manifest.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManifestItem[];

  it('contains the expected FR/EN platform sets', () => {
    expect(manifest).toHaveLength(46);

    for (const lang of ['fr', 'en']) {
      expect(manifest.filter((item) => item.lang === lang && item.platform === 'apple-phone')).toHaveLength(6);
      expect(manifest.filter((item) => item.lang === lang && item.platform === 'tablet')).toHaveLength(6);
      expect(manifest.filter((item) => item.lang === lang && item.platform === 'google-phone')).toHaveLength(6);
      expect(manifest.filter((item) => item.lang === lang && item.platform === 'google-tablet')).toHaveLength(4);
      expect(manifest.filter((item) => item.lang === lang && item.platform === 'google-feature')).toHaveLength(1);
    }
  });

  it('uses accepted dimensions and opaque PNG output', async () => {
    for (const item of manifest) {
      const filePath = path.join(root, item.path);
      expect(fs.existsSync(filePath)).toBe(true);

      const metadata = await sharp(filePath).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(item.width);
      expect(metadata.height).toBe(item.height);
      expect(metadata.hasAlpha).toBe(false);
      expect(metadata.channels).toBe(3);

      if (item.platform.startsWith('google') && item.platform !== 'google-feature') {
        expect(Math.max(item.width, item.height)).toBeLessThanOrEqual(3840);
        expect(Math.max(item.width, item.height) / Math.min(item.width, item.height)).toBeLessThanOrEqual(2);
      }
    }
  }, 120_000);

  it('keeps the strongest product story in the first three positions', () => {
    for (const lang of ['fr', 'en']) {
      const ordered = manifest
        .filter((item) => item.lang === lang && item.platform === 'apple-phone')
        .map((item) => item.slug)
        .sort();
      expect(ordered.slice(0, 3)).toEqual(['01-scan', '02-results', '03-trends']);
    }
  });
});
