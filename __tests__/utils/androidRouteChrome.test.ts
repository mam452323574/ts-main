import { DARK_COLORS, LIGHT_COLORS } from '@/constants/theme';
import {
  ANDROID_SECONDARY_BACKGROUND,
  getAndroidMainTabsSurfaceColor,
  getAndroidRouteChrome,
} from '@/utils/androidRouteChrome';

describe('androidRouteChrome', () => {
  it('uses the shared tabs surface for normalized main tab routes', () => {
    expect(getAndroidRouteChrome('/', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(LIGHT_COLORS),
        navigationButtonStyle: 'dark',
        statusBarStyle: 'dark',
        isMainTabsRoute: true,
      })
    );

    expect(getAndroidRouteChrome('/coach', DARK_COLORS, true)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(DARK_COLORS),
        navigationButtonStyle: 'light',
        statusBarStyle: 'light',
        isMainTabsRoute: true,
      })
    );

    expect(getAndroidRouteChrome('/scanner', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(LIGHT_COLORS),
        navigationButtonStyle: 'dark',
        statusBarStyle: 'light',
        isMainTabsRoute: true,
      })
    );
  });

  it('supports the legacy grouped pathname aliases used in tests and redirects', () => {
    expect(getAndroidRouteChrome('/(tabs)', LIGHT_COLORS, false).isMainTabsRoute).toBe(true);
    expect(getAndroidRouteChrome('/(tabs)/index', LIGHT_COLORS, false).isMainTabsRoute).toBe(true);
    expect(getAndroidRouteChrome('/(tabs)/coach', LIGHT_COLORS, false).isMainTabsRoute).toBe(true);
    expect(getAndroidRouteChrome('/(tabs)/scanner', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(LIGHT_COLORS),
        statusBarStyle: 'light',
      })
    );
  });

  it('treats empty or trailing-slash pathnames like the home tab', () => {
    expect(getAndroidRouteChrome('', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(LIGHT_COLORS),
        isMainTabsRoute: true,
      })
    );

    expect(getAndroidRouteChrome('/coach/', DARK_COLORS, true)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: getAndroidMainTabsSurfaceColor(DARK_COLORS),
        isMainTabsRoute: true,
      })
    );
  });

  it('keeps social-compose on the themed background to avoid a black bottom system gap', () => {
    expect(getAndroidRouteChrome('/social-compose', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: LIGHT_COLORS.background,
        navigationButtonStyle: 'dark',
        statusBarStyle: 'dark',
        isMainTabsRoute: false,
      })
    );

    expect(getAndroidRouteChrome('/social-compose', DARK_COLORS, true)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: DARK_COLORS.background,
        navigationButtonStyle: 'light',
        statusBarStyle: 'light',
        isMainTabsRoute: false,
      })
    );
  });

  it('keeps non-tab routes on the black Android system background', () => {
    expect(getAndroidRouteChrome('/settings', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: ANDROID_SECONDARY_BACKGROUND,
        navigationButtonStyle: 'light',
        statusBarStyle: 'dark',
        isMainTabsRoute: false,
      })
    );

    expect(getAndroidRouteChrome('/scan-preview', DARK_COLORS, true)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: ANDROID_SECONDARY_BACKGROUND,
        navigationButtonStyle: 'light',
        statusBarStyle: 'light',
        isMainTabsRoute: false,
      })
    );
  });

  it('keeps scan-frigo on the immersive black Android background with a light status bar', () => {
    expect(getAndroidRouteChrome('/scan-frigo', LIGHT_COLORS, false)).toEqual(
      expect.objectContaining({
        systemBackgroundColor: ANDROID_SECONDARY_BACKGROUND,
        navigationButtonStyle: 'light',
        statusBarStyle: 'light',
        isMainTabsRoute: false,
      })
    );
  });
});
