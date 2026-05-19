import React from 'react';
import { StyleSheet } from 'react-native';

import {
  SPACING,
  getThemeTokens,
} from '@/constants/theme';
import {
  MAIN_TAB_BAR_CONTENT_HEIGHT,
  getMainTabBarMetrics,
} from '@/utils/mainTabBarMetrics';

const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));

jest.mock('lucide-react-native', () => ({
  Home: ({ size, color }: { size: number; color: string }) => {
    const React = require('react');
    return React.createElement('HomeIcon', { size, color });
  },
  Compass: ({ size, color, strokeWidth }: { size: number; color: string; strokeWidth?: number }) => {
    const React = require('react');
    return React.createElement('CompassIcon', { size, color, strokeWidth });
  },
  ShieldCheck: ({ size, color, strokeWidth }: { size: number; color: string; strokeWidth?: number }) => {
    const React = require('react');
    return React.createElement('ShieldCheckIcon', { size, color, strokeWidth });
  },
  ScanLine: ({ size, color }: { size: number; color: string }) => {
    const React = require('react');
    return React.createElement('ScanLineIcon', { size, color });
  },
  Users: ({ size, color }: { size: number; color: string }) => {
    const React = require('react');
    return React.createElement('UsersIcon', { size, color });
  },
}));

const mockUseBadges = jest.fn(() => ({
  badges: {
    coach: false,
    social: false,
    recipes: false,
    exercises: false,
  },
}));

const mockUseTheme = jest.fn(() => ({
  isDark: false,
  colors: {
    background: '#F2F2F7',
    cardBackground: '#FFFFFF',
    primaryText: '#1D1D1F',
    secondaryText: '#FFFFFF',
    accentGreen: '#34C759',
    accent: '#007AFF',
    lightGray: '#E5E5EA',
    gray: '#8E8E93',
    grayLight: '#F8F8FA',
    grayMedium: '#C7C7CC',
    darkGray: '#424242',
    primary: '#007AFF',
    primaryLight: '#E3F2FF',
    primaryDark: '#0056B3',
    secondary: '#5856D6',
    white: '#FFFFFF',
    error: '#FF3B30',
    success: '#34C759',
    successLight: '#E8F9ED',
    warning: '#FF9500',
    gold: '#FFD700',
    goldLight: '#FFF8E1',
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/contexts/BadgeContext', () => ({
  useBadges: () => mockUseBadges(),
}));

jest.mock('@/contexts/ScannerCameraSessionContext', () => ({
  ScannerCameraSessionProvider: ({ children }: { children: React.ReactNode }) => children,
  ScannerCameraSessionHost: () => {
    const React = require('react');
    return React.createElement('ScannerCameraSessionHost');
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: any) => {
    const React = require('react');
    const { View: RNView } = require('react-native');
    return React.createElement('BlurView', props, children);
  },
}));

jest.mock('expo-router', () => ({
  withLayoutContext: () => (Navigator: React.ComponentType<any>) => {
    const React = require('react');
    const WrappedNavigator = (props: any) => React.createElement(Navigator, props, props.children);
    WrappedNavigator.Screen = () => null;
    return WrappedNavigator;
  },
}));

jest.mock('@react-navigation/material-top-tabs', () => ({
  createMaterialTopTabNavigator: () => {
    const React = require('react');
    const Navigator = (props: any) => React.createElement('MaterialTopTabs', props, props.children);
    return { Navigator };
  },
  MaterialTopTabBar: (props: any) => {
    const React = require('react');
    return React.createElement('MaterialTopTabBar', props);
  },
}));

import TabLayout from '@/app/(tabs)/_layout';

describe('TabLayout', () => {
  const resolveElement = (
    input: React.ReactElement<any, any>
  ): React.ReactElement<any, any> => {
    let current = input;

    while (typeof current.type === 'function') {
      try {
        current = current.type(current.props);
      } catch {
        break;
      }
    }

    return current;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  it('keeps the premium floating tab bar layout and always includes the social tab', () => {
    const element = TabLayout();
    const layoutRoot = React.Children.only(
      element.props.children
    ) as React.ReactElement<any, any>;
    const layoutChildren = React.Children.toArray(
      layoutRoot.props.children
    ) as React.ReactElement<any, any>[];
    const sessionHostElement = layoutChildren[0];
    const tabsElement = layoutChildren[1];
    const screenOptions = tabsElement.props.screenOptions;
    const screenElements = React.Children.toArray(
      tabsElement.props.children
    ) as React.ReactElement<
      {
        name: string;
        options: {
          title: string;
          sceneStyle?: { backgroundColor: string };
          tabBarIcon: ({ color }: { color: string }) => React.ReactElement<any, any>;
        };
      }
    >[];
    const expectedTokens = getThemeTokens(mockUseTheme().isDark);
    const expectedTabBarMetrics = getMainTabBarMetrics(mockUseSafeAreaInsets().bottom);
    const expectedLabelStyle = {
      fontSize: 12,
      textTransform: 'none',
      marginTop: 0,
    };
    const expectedSceneStyle = {
      backgroundColor: 'transparent',
    };
    const tabBarRoot = tabsElement.props.tabBar({
      position: {
        addListener: jest.fn(() => 'listener-id'),
        removeListener: jest.fn(),
      },
      state: {
        index: 1,
        routes: [
          { key: 'index', name: 'index' },
          { key: 'coach', name: 'coach' },
          { key: 'scanner', name: 'scanner' },
          { key: 'social', name: 'social' },
        ],
      },
    });
    const tabBarElement = resolveElement(tabBarRoot);

    const homeIcon = resolveElement(
      screenElements[0].props.options.tabBarIcon({ color: '#007AFF' })
    );
    const analyticsIcon = resolveElement(
      screenElements[1].props.options.tabBarIcon({ color: '#8E8E93' })
    );
    const scannerIcon = resolveElement(
      screenElements[2].props.options.tabBarIcon({ color: '#007AFF' })
    );
    const socialIcon = resolveElement(
      screenElements[3].props.options.tabBarIcon({ color: '#007AFF' })
    );
    const socialChildren = React.Children.toArray(
      socialIcon.props.children
    ) as React.ReactElement<any, any>[];
    const tabBarHostStyle = StyleSheet.flatten(tabBarElement.props.style);
    const tabBarShadow = React.Children.toArray(
      tabBarElement.props.children
    )[0] as React.ReactElement<any, any>;
    const tabBarShadowStyle = StyleSheet.flatten(tabBarShadow.props.style);
    const tabBarSurface = React.Children.toArray(
      tabBarShadow.props.children
    )[0] as React.ReactElement<any, any>;
    const tabBarSurfaceStyle = StyleSheet.flatten(tabBarSurface.props.style);
    const tabBarSurfaceChildren = React.Children.toArray(
      tabBarSurface.props.children
    ) as React.ReactElement<any, any>[];
    const tabBarBlur = tabBarSurfaceChildren.find(
      (child) => child.props.testID === 'main-tab-bar-blur'
    );
    const tabBarTint = tabBarSurfaceChildren.find(
      (child) => child.props.testID === 'main-tab-bar-tint'
    );
    const innerMaterialTabBar = tabBarSurfaceChildren.find(
      (child) =>
        typeof child.type === 'function' &&
        child.type.name === 'MaterialTopTabBar'
    );

    expect(layoutRoot.props.style).toEqual(expect.objectContaining({ flex: 1 }));
    expect(sessionHostElement.type).toBeDefined();
    expect(tabsElement.props.style).toEqual(
      expect.objectContaining({ backgroundColor: 'transparent' })
    );
    expect(tabsElement.props.pagerStyle).toEqual(
      expect.objectContaining({ backgroundColor: 'transparent' })
    );
    expect(screenOptions.tabBarStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'transparent',
        height: MAIN_TAB_BAR_CONTENT_HEIGHT,
        elevation: 0,
        shadowOpacity: 0,
        borderTopWidth: 0,
        borderTopColor: 'transparent',
      })
    );
    expect(typeof tabsElement.props.tabBar).toBe('function');
    expect(tabBarElement.props.testID).toBe('main-tab-bar-host');
    expect(tabBarHostStyle).toEqual(
      expect.objectContaining({
        position: 'absolute',
        left: SPACING.page,
        right: SPACING.page,
        bottom: expectedTabBarMetrics.bottomOffset,
      })
    );
    expect(tabBarShadow.props.testID).toBe('main-tab-bar-shadow');
    expect(tabBarShadowStyle).toEqual(
      expect.objectContaining({
        height: MAIN_TAB_BAR_CONTENT_HEIGHT,
        borderRadius: MAIN_TAB_BAR_CONTENT_HEIGHT / 2,
        shadowOpacity: 0.26,
        shadowRadius: 24,
        elevation: 8,
      })
    );
    expect(tabBarSurface.props.testID).toBe('main-tab-bar-surface');
    expect(tabBarSurfaceStyle).toEqual(
      expect.objectContaining({
        borderRadius: MAIN_TAB_BAR_CONTENT_HEIGHT / 2,
        borderWidth: 1,
        borderColor: expectedTokens.tabBar.border,
        overflow: 'hidden',
        backgroundColor: 'transparent',
      })
    );
    expect(tabBarBlur?.props).toEqual(
      expect.objectContaining({
        tint: 'light',
        intensity: 78,
      })
    );
    expect(tabBarTint).toBeDefined();
    expect(innerMaterialTabBar).toBeDefined();
    expect(screenOptions).not.toHaveProperty('tabBarContentContainerStyle');
    expect(screenOptions).not.toHaveProperty('tabBarIndicatorContainerStyle');
    expect(screenOptions.sceneStyle).toEqual(expectedSceneStyle);
    expect(screenOptions.tabBarActiveTintColor).toBe(expectedTokens.tabBar.active);
    expect(screenOptions.tabBarInactiveTintColor).toBe(expectedTokens.tabBar.inactive);
    expect(screenOptions.tabBarLabelStyle).toEqual(expect.objectContaining(expectedLabelStyle));
    expect(screenOptions.lazy).toBe(true);
    expect(screenOptions.lazyPreloadDistance).toBe(2);
    expect(screenElements).toHaveLength(4);
    expect(screenElements[1].props.name).toBe('coach');
    expect(screenElements[1].props.options.title).toBe('tabs.coach');
    expect(screenElements[2].props.options.sceneStyle).toEqual({
      backgroundColor: 'transparent',
    });
    expect(screenElements[3].props.options.title).toBe('tabs.social');
    expect(screenElements[3].props.options).not.toHaveProperty('tabBarItemStyle');
    expect(screenElements[3].props.options).not.toHaveProperty('tabBarShowIcon');
    expect(screenElements[3].props.options).not.toHaveProperty('tabBarShowLabel');

    expect(homeIcon.type).toBe('HomeIcon');
    expect(homeIcon.props).toEqual(
      expect.objectContaining({
        size: 24,
        color: '#007AFF',
      })
    );
    expect(analyticsIcon.props.children).toBeDefined();
    expect(resolveElement(analyticsIcon.props.children).type).toBe('CompassIcon');
    expect(resolveElement(analyticsIcon.props.children).props).toEqual(
      expect.objectContaining({
        size: 24,
        color: '#8E8E93',
      })
    );
    expect(scannerIcon.props.children).toBeDefined();
    expect(resolveElement(scannerIcon.props.children).type).toBe('ScanLineIcon');
    expect(resolveElement(scannerIcon.props.children).props).toEqual(
      expect.objectContaining({
        size: 24,
        color: '#007AFF',
      })
    );
    expect(resolveElement(socialChildren[0]).type).toBe('UsersIcon');
  });

  it('renders the social tab badge dot when badges are present', () => {
    mockUseBadges.mockReturnValue({
      badges: {
        coach: false,
        social: true,
        recipes: false,
        exercises: false,
      },
    });

    const element = TabLayout();
    const layoutRoot = React.Children.only(
      element.props.children
    ) as React.ReactElement<any, any>;
    const tabsElement = React.Children.toArray(
      layoutRoot.props.children
    )[1] as React.ReactElement<any, any>;
    const screenElements = React.Children.toArray(
      tabsElement.props.children
    ) as React.ReactElement<
      {
        options: {
          tabBarIcon: ({ color }: { color: string }) => React.ReactElement<any, any>;
          title: string;
        };
      }
    >[];
    const activeSocialIcon = resolveElement(
      screenElements[3].props.options.tabBarIcon({ color: '#007AFF' })
    );
    const inactiveSocialIcon = resolveElement(
      screenElements[3].props.options.tabBarIcon({ color: '#8E8E93' })
    );
    const activeSocialChildren = React.Children.toArray(
      activeSocialIcon.props.children
    ) as React.ReactElement<any, any>[];
    const inactiveSocialChildren = React.Children.toArray(
      inactiveSocialIcon.props.children
    ) as React.ReactElement<any, any>[];
    const activeSocialIconElement = resolveElement(activeSocialChildren[0]);
    const inactiveSocialIconElement = resolveElement(inactiveSocialChildren[0]);
    const badgeDot = activeSocialChildren.find(
      (child) => child.props.testID === 'social-tab-badge-dot'
    );

    expect(screenElements).toHaveLength(4);
    expect(screenElements[3].props.options.title).toBe('tabs.social');
    expect(activeSocialIconElement.type).toBe('UsersIcon');
    expect(activeSocialIconElement.props).toEqual(
      expect.objectContaining({
        size: 24,
        color: '#007AFF',
      })
    );
    expect(inactiveSocialIconElement.type).toBe('UsersIcon');
    expect(inactiveSocialIconElement.props).toEqual(
      expect.objectContaining({
        size: 24,
        color: '#8E8E93',
      })
    );
    expect(badgeDot).toBeDefined();
  });
});
