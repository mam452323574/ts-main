import fs from 'node:fs';
import path from 'node:path';

const sharp = require('sharp');

const projectPath = (...parts: string[]) => path.join(process.cwd(), ...parts);

describe('SelfLens brand assets', () => {
  const paths = {
    icon: projectPath('assets', 'images', 'icon.png'),
    favicon: projectPath('assets', 'images', 'favicon.png'),
    adaptiveForeground: projectPath('assets', 'images', 'android-adaptive-foreground.png'),
    adaptiveMonochrome: projectPath('assets', 'images', 'android-adaptive-monochrome.png'),
    notification: projectPath('assets', 'images', 'notification-icon.png'),
    splash: projectPath('assets', 'images', 'splash-icon.png'),
    appStore: projectPath(
      'store-assets',
      'store-refresh-2026-07',
      'brand',
      'app-store-icon-1024.png',
    ),
    playStore: projectPath(
      'store-assets',
      'store-refresh-2026-07',
      'brand',
      'google-play-icon-512.png',
    ),
  };

  it('ships an opaque, full-colour 1024px iOS icon', async () => {
    expect(fs.existsSync(paths.icon)).toBe(true);

    const metadata = await sharp(paths.icon).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
    expect(metadata.hasAlpha).toBe(false);
    expect(metadata.channels).toBe(3);

    const sampled = await sharp(paths.icon)
      .resize(32, 32)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();

    for (let index = 0; index < sampled.data.length; index += sampled.info.channels) {
      colors.add(
        [sampled.data[index], sampled.data[index + 1], sampled.data[index + 2]].join(','),
      );
    }

    expect(colors.size).toBeGreaterThan(32);
    expect(colors.has('76,175,80')).toBe(false);
  });

  it.each([
    ['adaptive foreground', paths.adaptiveForeground, 1024],
    ['adaptive monochrome', paths.adaptiveMonochrome, 1024],
    ['splash mark', paths.splash, 1024],
    ['notification mark', paths.notification, 96],
  ])('keeps the %s transparent and correctly sized', async (_label, filePath, size) => {
    expect(fs.existsSync(filePath)).toBe(true);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(size);
    expect(metadata.height).toBe(size);
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.channels).toBe(4);
  });

  it('exports store-specific icon files', async () => {
    const [appStoreMetadata, playStoreMetadata] = await Promise.all([
      sharp(paths.appStore).metadata(),
      sharp(paths.playStore).metadata(),
    ]);

    expect(appStoreMetadata.width).toBe(1024);
    expect(appStoreMetadata.height).toBe(1024);
    expect(appStoreMetadata.hasAlpha).toBe(false);

    expect(playStoreMetadata.width).toBe(512);
    expect(playStoreMetadata.height).toBe(512);
    expect(playStoreMetadata.hasAlpha).toBe(true);
    expect(playStoreMetadata.channels).toBe(4);
    expect(fs.statSync(paths.playStore).size).toBeLessThanOrEqual(1024 * 1024);
  });

  it('keeps the favicon derived from the same opaque icon family', async () => {
    const metadata = await sharp(paths.favicon).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(48);
    expect(metadata.height).toBe(48);
    expect(metadata.hasAlpha).toBe(false);
  });

  it('points Expo at dedicated assets for each platform role', () => {
    const appJson = JSON.parse(fs.readFileSync(projectPath('app.json'), 'utf8')).expo;
    const notificationsPlugin = appJson.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    );

    expect(appJson.icon).toBe('./assets/images/icon.png');
    expect(appJson.splash).toMatchObject({
      image: './assets/images/splash-icon.png',
      backgroundColor: '#0D2A64',
    });
    expect(appJson.android.adaptiveIcon).toEqual({
      foregroundImage: './assets/images/android-adaptive-foreground.png',
      monochromeImage: './assets/images/android-adaptive-monochrome.png',
      backgroundColor: '#0D2A64',
    });
    expect(notificationsPlugin?.[1]).toMatchObject({
      icon: './assets/images/notification-icon.png',
      color: '#2F66C5',
    });
  });

  it('keeps checked-in Android resources synchronized with the v2 brand', async () => {
    const nativeLauncher = projectPath(
      'android',
      'app',
      'src',
      'main',
      'res',
      'mipmap-xxxhdpi',
      'ic_launcher.webp',
    );
    const nativeForeground = projectPath(
      'android',
      'app',
      'src',
      'main',
      'res',
      'mipmap-xxxhdpi',
      'ic_launcher_foreground.webp',
    );
    const nativeMonochrome = projectPath(
      'android',
      'app',
      'src',
      'main',
      'res',
      'mipmap-xxxhdpi',
      'ic_launcher_monochrome.webp',
    );
    const colorsXml = fs.readFileSync(
      projectPath('android', 'app', 'src', 'main', 'res', 'values', 'colors.xml'),
      'utf8',
    );

    expect(fs.existsSync(nativeForeground)).toBe(true);
    expect(fs.existsSync(nativeMonochrome)).toBe(true);
    expect(colorsXml).toContain('<color name="iconBackground">#0D2A64</color>');
    expect(colorsXml).not.toContain('#4CAF50');

    const launcherPixels = await sharp(nativeLauncher).resize(16, 16).removeAlpha().raw().toBuffer();
    for (let index = 0; index < launcherPixels.length; index += 3) {
      expect([
        launcherPixels[index],
        launcherPixels[index + 1],
        launcherPixels[index + 2],
      ]).not.toEqual([76, 175, 80]);
    }
  });
});
