import { type ReactNode } from 'react';
import { View, Dimensions, Platform, StyleSheet } from 'react-native';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBar,
  type MaterialTopTabBarProps,
  type MaterialTopTabNavigationOptions,
  type MaterialTopTabNavigationEventMap,
} from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Home, ScanLine, Users } from 'lucide-react-native';

import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { useBadges } from '@/contexts/BadgeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SPACING,
  getMainPageChrome,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { getAndroidMainTabsSurfaceColor } from '@/utils/androidRouteChrome';
import {
  MAIN_TAB_BAR_CONTENT_HEIGHT,
  getMainTabBarMetrics,
} from '@/utils/mainTabBarMetrics';
import {
  ScannerCameraSessionHost,
  ScannerCameraSessionProvider,
} from '@/contexts/ScannerCameraSessionContext';
import { Squircle } from '@/components/Squircle';

// Create the custom Material Top Tabs navigator
const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator, undefined, true);

function CoachTabIcon({ size, color }: { size: number; color: string }) {
  return (
    <View>
      <CoachFeatureIcon size={size} color={color} />
    </View>
  );
}

function ScannerTabIcon({ size, color }: { size: number; color: string }) {
  return (
    <View>
      <ScanLine size={size} color={color} />
    </View>
  );
}

function TabIconWithBadge({
  children,
  showBadge = false,
  badgeColor,
}: {
  children: ReactNode;
  showBadge?: boolean;
  badgeColor: string;
}) {
  return (
    <View style={styles.tabIconContainer}>
      {children}
      {showBadge ? (
        <Squircle
          style={[styles.tabBadgeDot, { backgroundColor: badgeColor }]}
          testID="social-tab-badge-dot"
        />
      ) : null}
    </View>
  );
}

function GlassTabBar(props: MaterialTopTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tokens = getThemeTokens(isDark);
  const chrome = getMainPageChrome(colors, isDark, 'trust');
  const metrics = getMainTabBarMetrics(insets.bottom);
  const androidSurfaceColor = getAndroidMainTabsSurfaceColor(colors);
  const tintOverlayColor =
    Platform.OS === 'android'
      ? withAlpha(androidSurfaceColor, isDark ? 0.68 : 0.76)
      : chrome.headerBackground;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarFloatingHost, { bottom: metrics.bottomOffset }]}
      testID="main-tab-bar-host"
    >
      <Squircle
        style={[
          styles.tabBarShadow,
          {
            height: metrics.contentHeight,
          },
        ]}
        testID="main-tab-bar-shadow"
      >
        <Squircle
          style={[
            styles.tabBarGlassSurface,
            {
              borderColor: tokens.tabBar.border,
            },
          ]}
          testID="main-tab-bar-surface"
        >
          <BlurView
            tint={isDark ? 'dark' : 'light'}
            intensity={Platform.OS === 'android' ? 54 : 78}
            experimentalBlurMethod={
              Platform.OS === 'android' ? 'dimezisBlurView' : undefined
            }
            style={StyleSheet.absoluteFill}
            testID="main-tab-bar-blur"
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: tintOverlayColor }]}
            testID="main-tab-bar-tint"
          />
          <MaterialTopTabBar {...props} />
        </Squircle>
      </Squircle>
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { badges } = useBadges();
  const tokens = getThemeTokens(isDark);
  const initialLayout =
    Platform.OS === 'web' ? undefined : { width: Dimensions.get('window').width };

  return (
    <ScannerCameraSessionProvider>
      <View style={styles.layoutRoot}>
        <ScannerCameraSessionHost />
        <MaterialTopTabs
          initialLayout={initialLayout}
          tabBarPosition="bottom"
          pagerStyle={styles.tabsPager}
          style={styles.tabsContainer}
          tabBar={(props) => <GlassTabBar {...props} />}
          initialRouteName="index"
          screenOptions={{
            sceneStyle: { backgroundColor: 'transparent' },
            tabBarActiveTintColor: tokens.tabBar.active,
            tabBarInactiveTintColor: tokens.tabBar.inactive,
            tabBarStyle: {
              backgroundColor: 'transparent',
              height: MAIN_TAB_BAR_CONTENT_HEIGHT,
              elevation: 0,
              shadowOpacity: 0,
              borderTopWidth: 0,
              borderTopColor: 'transparent',
            },
            tabBarIndicatorStyle: {
              backgroundColor: tokens.tabBar.indicator,
              height: 2,
              top: 0,
              borderRadius: 2, borderCurve: 'continuous',
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontFamily: FONT_FAMILIES.body,
              fontWeight: FONT_WEIGHTS.medium,
              textTransform: 'none',
              marginTop: 0,
            },
            tabBarShowIcon: true,
            tabBarShowLabel: true,
            swipeEnabled: true,
            lazy: true, // Load tabs lazily for performance
            lazyPreloadDistance: 2,
          }}
        >
          <MaterialTopTabs.Screen
            name="index"
            options={{
              title: t('tabs.home'),
              tabBarIcon: ({ color }) => <Home size={24} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="coach"
            options={{
              title: t('tabs.coach'),
              tabBarIcon: ({ color }) => <CoachTabIcon size={24} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="scanner"
            options={{
              title: t('tabs.scanner'),
              sceneStyle: { backgroundColor: 'transparent' },
              tabBarIcon: ({ color }) => <ScannerTabIcon size={24} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="social"
            options={{
              title: t('tabs.social'),
              tabBarIcon: ({ color }) => (
                <TabIconWithBadge
                  showBadge={badges.social}
                  badgeColor={colors.error}
                >
                  <Users size={24} color={color} />
                </TabIconWithBadge>
              ),
            }}
          />
        </MaterialTopTabs>
      </View>
    </ScannerCameraSessionProvider>
  );
}

const styles = StyleSheet.create({
  layoutRoot: {
    flex: 1,
  },
  tabsContainer: {
    backgroundColor: 'transparent',
  },
  tabsPager: {
    backgroundColor: 'transparent',
  },
  tabBarFloatingHost: {
    position: 'absolute',
    left: SPACING.page,
    right: SPACING.page,
    zIndex: 20,
    elevation: 20,
  },
  tabBarShadow: {
    borderRadius: MAIN_TAB_BAR_CONTENT_HEIGHT / 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 8, borderCurve: 'continuous',
  },
  tabBarGlassSurface: {
    flex: 1,
    borderRadius: MAIN_TAB_BAR_CONTENT_HEIGHT / 2,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent', borderCurve: 'continuous',
  },
  tabIconContainer: {
    position: 'relative',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: -1,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: 4.5, borderCurve: 'continuous',
  },
});
