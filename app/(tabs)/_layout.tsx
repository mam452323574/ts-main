import type { ReactNode } from 'react';
import { View, Dimensions, Platform, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabNavigationOptions, MaterialTopTabNavigationEventMap } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ScanLine, Users } from 'lucide-react-native';

import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { useBadges } from '@/contexts/BadgeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAndroidMainTabsSurfaceColor } from '@/utils/androidRouteChrome';

// Create the custom Material Top Tabs navigator
const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator, undefined, true);

// Fixed height for the tab bar content area (icons + labels)
const TAB_BAR_CONTENT_HEIGHT = 60;

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
        <View
          style={[styles.tabBadgeDot, { backgroundColor: badgeColor }]}
          testID="social-tab-badge-dot"
        />
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { badges } = useBadges();
  const insets = useSafeAreaInsets();
  const tabBarSurfaceColor = getAndroidMainTabsSurfaceColor(colors);
  const initialLayout =
    Platform.OS === 'web' ? undefined : { width: Dimensions.get('window').width };

  // Use the actual safe-area bottom inset; fall back to a small minimum so icons
  // don't sit flush against the screen edge on devices without a home indicator.
  const safeBottomPadding = Math.max(insets.bottom, 6);

  return (
    <MaterialTopTabs
      initialLayout={initialLayout}
      tabBarPosition="bottom"
      initialRouteName="index"
      screenOptions={{
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray,
        tabBarStyle: {
          backgroundColor: tabBarSurfaceColor,
          paddingBottom: safeBottomPadding,
          height: TAB_BAR_CONTENT_HEIGHT + safeBottomPadding,
          // Suppress the dark band / separator above the tab bar
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,        // Android: remove Material shadow
          shadowOpacity: 0,    // iOS: remove shadow
        },
        tabBarIndicatorStyle: {
          backgroundColor: colors.primary,
          height: 3,
          top: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          textTransform: 'none',
          marginTop: 0,
        },
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        swipeEnabled: true,
        lazy: true, // Load tabs lazily for performance
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
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: -1,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
