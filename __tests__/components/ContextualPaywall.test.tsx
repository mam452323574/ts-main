import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { ContextualPaywall } from '@/components/ContextualPaywall';
import { LIGHT_COLORS, getAndroidLightSurface } from '@/constants/theme';

const mockPush = jest.fn();
const getStyles = (style: any) => (Array.isArray(style) ? style : [style]);
const originalPlatform = Platform.OS;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} testID="paywall-primary-button">
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

describe('ContextualPaywall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  });

  it('renders title, subtitle, description and bullets', () => {
    const { getByText } = render(
      <ContextualPaywall
        visible={true}
        onClose={jest.fn()}
        title="Premium required"
        subtitle="Soft premium subtitle"
        description="Detailed explanation"
        bulletPoints={['Point A', 'Point B']}
      />
    );

    expect(getByText('Premium required')).toBeTruthy();
    expect(getByText('Soft premium subtitle')).toBeTruthy();
    expect(getByText('Detailed explanation')).toBeTruthy();
    expect(getByText('Point A')).toBeTruthy();
    expect(getByText('Point B')).toBeTruthy();
  });

  it('closes when secondary button is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <ContextualPaywall visible={true} onClose={onClose} title="Premium" secondaryButtonText="Later" />
    );

    fireEvent.press(getByText('Later'));
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates to premium screen when primary button is pressed without custom handler', () => {
    const { getByTestId } = render(
      <ContextualPaywall visible={true} onClose={jest.fn()} title="Premium" primaryButtonText="Upgrade" />
    );

    fireEvent.press(getByTestId('paywall-primary-button'));
    expect(mockPush).toHaveBeenCalledWith('/premium-upgrade');
  });

  it('uses custom primary action when provided', () => {
    const onPrimaryPress = jest.fn();
    const { getByTestId } = render(
      <ContextualPaywall
        visible={true}
        onClose={jest.fn()}
        title="Premium"
        onPrimaryPress={onPrimaryPress}
        primaryButtonText="Continue"
      />
    );

    fireEvent.press(getByTestId('paywall-primary-button'));
    expect(onPrimaryPress).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('suppresses the decorative badge when badgeIcon is null', () => {
    const { queryByTestId } = render(
      <ContextualPaywall
        visible={true}
        onClose={jest.fn()}
        title="Premium"
        badgeIcon={null}
      />
    );

    expect(queryByTestId('contextual-paywall-badge')).toBeNull();
  });

  it('uses separated Android light shell and surface styles', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const expectedSurface = getAndroidLightSurface(LIGHT_COLORS, {
      accentColor: LIGHT_COLORS.primary,
      shadowColor: LIGHT_COLORS.gray,
      backgroundAlpha: 0.04,
      borderAlpha: 0.12,
      overlayAlpha: 0.08,
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffsetY: 10,
      elevation: 8,
    });

    const { getByTestId } = render(
      <ContextualPaywall visible={true} onClose={jest.fn()} title="Premium" />
    );

    const shellStyles = getStyles(getByTestId('contextual-paywall-shell').props.style);
    const surfaceStyles = getStyles(getByTestId('contextual-paywall-surface').props.style);

    expect(shellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elevation: 8,
          shadowColor: expectedSurface.shadowStyle.shadowColor,
        }),
      ])
    );
    expect(surfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: expectedSurface.backgroundColor,
          borderColor: expectedSurface.borderColor,
          overflow: 'hidden',
        }),
      ])
    );
  });
});
