import type { NavigationBarButtonStyle } from 'expo-navigation-bar';

import type { ThemeColors } from '@/constants/theme';

export const ANDROID_SECONDARY_BACKGROUND = '#000000';
export const MAIN_TABS_ROUTES = new Set([
  '/',
  '/index',
  '/coach',
  '/social',
  '/scanner',
  '/(tabs)',
  '/(tabs)/index',
  '/(tabs)/coach',
  '/(tabs)/social',
  '/(tabs)/scanner',
]);
export const THEMED_ANDROID_UI_ROUTES = new Set([
  '/admin-social-moderation',
  '/analytics',
  '/coach',
  '/coach-history',
  '/entry-offer',
  '/exercises',
  '/notifications',
  '/notification-settings',
  '/premium-upgrade',
  '/privacy-policy',
  '/recipes',
  '/scan-result',
  '/settings',
  '/share-story',
  '/social-comments',
  '/social-compose',
  '/social-post',
  '/super-scan-result',
]);

type StatusBarStyle = 'light' | 'dark';

export type AndroidRouteChrome = {
  systemBackgroundColor: string;
  navigationButtonStyle: NavigationBarButtonStyle;
  statusBarStyle: StatusBarStyle;
  isMainTabsRoute: boolean;
};

function normalizePathname(pathname: string) {
  if (!pathname) {
    return '/';
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function normalizeHex(color: string) {
  if (!color.startsWith('#')) {
    return null;
  }

  const hex = color.slice(1);
  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (hex.length === 6) {
    return hex;
  }

  return null;
}

function getSrgbChannelLuminance(value: number) {
  const normalized = value / 255;

  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function isLightColor(color: string) {
  const normalized = normalizeHex(color);
  if (!normalized) {
    return false;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  const luminance =
    0.2126 * getSrgbChannelLuminance(r) +
    0.7152 * getSrgbChannelLuminance(g) +
    0.0722 * getSrgbChannelLuminance(b);

  return luminance > 0.5;
}

export function getAndroidMainTabsSurfaceColor(
  colors: Pick<ThemeColors, 'cardBackground' | 'background'>
) {
  return colors.background;
}

export function getAndroidRouteChrome(
  pathname: string,
  colors: Pick<ThemeColors, 'cardBackground' | 'background'>,
  isDark: boolean
): AndroidRouteChrome {
  const normalizedPathname = normalizePathname(pathname);
  const isMainTabsRoute = MAIN_TABS_ROUTES.has(normalizedPathname);
  const isScannerRoute =
    normalizedPathname === '/scanner' || normalizedPathname === '/(tabs)/scanner';
  const isScanPreviewRoute = normalizedPathname === '/scan-preview';
  const isFridgeScanRoute = normalizedPathname === '/scan-frigo';
  const isThemedUiRoute = THEMED_ANDROID_UI_ROUTES.has(normalizedPathname);
  const systemBackgroundColor = isMainTabsRoute
    ? getAndroidMainTabsSurfaceColor(colors)
    : isThemedUiRoute
      ? colors.background
      : ANDROID_SECONDARY_BACKGROUND;

  return {
    systemBackgroundColor,
    navigationButtonStyle: isLightColor(systemBackgroundColor) ? 'dark' : 'light',
    statusBarStyle:
      isScanPreviewRoute || isScannerRoute || isFridgeScanRoute || isDark
        ? 'light'
        : 'dark',
    isMainTabsRoute,
  };
}
