import fs from 'fs';
import path from 'path';

describe('Android theme resources', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const appConfigPath = path.join(rootDir, 'app.json');
  const stylesPath = path.join(rootDir, 'android/app/src/main/res/values/styles.xml');
  const lightColorsPath = path.join(rootDir, 'android/app/src/main/res/values/colors.xml');
  const darkColorsPath = path.join(rootDir, 'android/app/src/main/res/values-night/colors.xml');

  it('uses a day-night surface background resource instead of a static black app background', () => {
    const stylesXml = fs.readFileSync(stylesPath, 'utf8');
    const lightColorsXml = fs.readFileSync(lightColorsPath, 'utf8');
    const darkColorsXml = fs.readFileSync(darkColorsPath, 'utf8');

    expect(stylesXml).toContain('@color/app_surface_background');
    expect(stylesXml).toContain('<item name="android:enforceNavigationBarContrast" tools:targetApi="29">false</item>');
    expect(stylesXml).not.toContain('@color/app_background_dark');
    expect(lightColorsXml).toContain('<color name="app_surface_background">#FFFFFF</color>');
    expect(lightColorsXml).not.toContain('app_background_dark');
    expect(darkColorsXml).toContain('<color name="app_surface_background">#1C1C1E</color>');
    expect(darkColorsXml).not.toContain('app_background_dark');
  });

  it('declares the native Android navigation bar defaults in app config', () => {
    const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));

    expect(appConfig.expo.androidNavigationBar).toEqual(
      expect.objectContaining({
        barStyle: 'light-content',
        enforceContrast: false,
      })
    );
  });
});
