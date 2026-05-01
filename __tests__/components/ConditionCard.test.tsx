import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ConditionCard } from '@/components/ConditionCard';

const mockPush = jest.fn();
const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primaryText: '#000000',
      gray: '#8E8E93',
      lightGray: '#E5E5EA',
      white: '#FFFFFF',
      primary: '#007AFF',
      cardBackground: '#FFFFFF',
      background: '#F2F2F7',
    },
    isDark: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.metrics.explanation': 'Explanation',
        'common.metrics.advice': 'Advice',
        'common.metrics.probability': 'Probability',
        'condition_card.unlock': 'Unlock',
        'condition_card.locked.explanation_teaser':
          'Premium adds the full explanation behind this signal.',
        'condition_card.locked.advice_teaser':
          'Premium unlocks the next-step guidance for this signal.',
        'condition_card.loading.explanation': 'Explanation is syncing.',
        'condition_card.loading.advice': 'Advice is syncing.',
        'qualitative_levels.severity.moderate': 'Moderate',
        'scan.super.conditions.unknown.label': 'Unknown finding',
        'scan.super.categories.general': 'General',
        'scan.super.categories.unknown': 'Other',
        'scan.super.categories.posture': 'Posture',
        'scan.super.explanations.unknown': 'Details unavailable.',
        'scan.super.advice.unknown': 'Advice unavailable.',
        'scan.super.explanations.test_explanation':
          'Premium explanation kept behind the lock.',
        'scan.super.advice.test_advice':
          'Premium advice kept behind the lock.',
      };

      return translations[key] ?? key;
    },
  }),
}));

jest.mock('lucide-react-native', () => {
  const ReactLocal = require('react');
  const { Text: RNText } = require('react-native');
  const makeIcon = (label: string) => (props: any) =>
    ReactLocal.createElement(RNText, props, label);

  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') {
          return true;
        }

        return makeIcon(String(prop));
      },
    },
  );
});

describe('ConditionCard', () => {
  const lockedCondition = {
    condition_key: 'test_condition',
    category_key: 'general',
    probability: 85,
    severity_key: 'moderate' as const,
    explanation_key: 'test_explanation',
    advice_key: 'test_advice',
  };

  const unknownCondition = {
    condition_key: 'unknown',
    category_key: 'general',
    probability: 85,
    severity_key: 'moderate' as const,
    explanation_key: 'unknown',
    advice_key: 'unknown',
  };

  const postureCondition = {
    ...lockedCondition,
    category_key: 'posture',
  };

  const unknownCategoryCondition = {
    ...lockedCondition,
    category_key: 'mystery_signal',
  };

  const fallbackTextCondition = {
    condition_key: 'unknown',
    condition_fallback_text: 'Webhook-specific finding',
    category_key: 'unknown',
    category_fallback_text: 'Custom category',
    probability: 64,
    severity_key: 'moderate' as const,
    explanation_key: 'unknown',
    explanation_fallback_text: 'Detailed webhook explanation shown to premium users.',
    advice_key: 'unknown',
    advice_fallback_text: 'Detailed webhook advice shown to premium users.',
  };

  beforeEach(() => {
    mockPush.mockClear();
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  it('shows translated section labels after the redesign', () => {
    const { getByText } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="locked" />,
    );

    expect(getByText('Explanation')).toBeTruthy();
    expect(getByText('Advice')).toBeTruthy();
    expect(getByText('Probability')).toBeTruthy();
    expect(getByText('Moderate')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
  });

  it('maps category badges to the centralized icon catalog, including fallback and custom categories', () => {
    const { getByTestId, rerender } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="locked" />,
    );

    expect(getByTestId('condition-card-category-icon-general')).toBeTruthy();

    rerender(
      <ConditionCard condition={postureCondition} premiumRenderState="locked" />,
    );
    expect(getByTestId('condition-card-category-icon-posture')).toBeTruthy();

    rerender(
      <ConditionCard
        condition={unknownCategoryCondition}
        premiumRenderState="locked"
      />,
    );
    expect(getByTestId('condition-card-category-icon-unknown')).toBeTruthy();
  });

  it('does not render premium explanation or advice text for free users', () => {
    const { getByTestId, queryByText, getByText } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="locked" />,
    );

    expect(getByTestId('condition-card-unlock-explanation')).toBeTruthy();
    expect(getByTestId('condition-card-unlock-advice')).toBeTruthy();
    expect(getByText('Premium adds the full explanation behind this signal.')).toBeTruthy();
    expect(getByText('Premium unlocks the next-step guidance for this signal.')).toBeTruthy();
    expect(queryByText('Premium explanation kept behind the lock.')).toBeNull();
    expect(queryByText('Premium advice kept behind the lock.')).toBeNull();
  });

  it('navigates to premium upgrade when unlock is pressed for non-premium user', () => {
    const { getByTestId } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="locked" />,
    );

    fireEvent.press(getByTestId('condition-card-unlock-explanation'));

    expect(mockPush).toHaveBeenCalledWith('/premium-upgrade');
  });

  it('renders the localized premium explanation and advice for unlocked users', () => {
    const { queryByText, getByText } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="unlocked" />,
    );

    expect(queryByText('Unlock')).toBeNull();
    expect(getByText('Premium explanation kept behind the lock.')).toBeTruthy();
    expect(getByText('Premium advice kept behind the lock.')).toBeTruthy();
  });

  it('renders a neutral loading state without upgrade cta', () => {
    const { queryByText, getByText, queryByTestId } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="loading" />,
    );

    expect(queryByText('Unlock')).toBeNull();
    expect(getByText('Explanation is syncing.')).toBeTruthy();
    expect(getByText('Advice is syncing.')).toBeTruthy();
    expect(queryByTestId('condition-card-unlock-explanation')).toBeNull();
  });

  it('uses controlled unknown placeholders instead of humanized internal keys', () => {
    const { queryByText, getByText } = render(
      <ConditionCard condition={unknownCondition} premiumRenderState="unlocked" />,
    );

    expect(queryByText('Unlock')).toBeNull();
    expect(getByText('Unknown finding')).toBeTruthy();
    expect(getByText('Details unavailable.')).toBeTruthy();
    expect(getByText('Advice unavailable.')).toBeTruthy();
  });

  it('prefers preserved webhook fallback text for unlocked users', () => {
    const { getByText, queryByText } = render(
      <ConditionCard
        condition={fallbackTextCondition}
        premiumRenderState="unlocked"
      />,
    );

    expect(getByText('Webhook-specific finding')).toBeTruthy();
    expect(getByText('Custom category')).toBeTruthy();
    expect(
      getByText('Detailed webhook explanation shown to premium users.'),
    ).toBeTruthy();
    expect(
      getByText('Detailed webhook advice shown to premium users.'),
    ).toBeTruthy();
    expect(queryByText('Unknown finding')).toBeNull();
    expect(queryByText('Details unavailable.')).toBeNull();
    expect(queryByText('Advice unavailable.')).toBeNull();
  });

  it('stacks the probability card cleanly in compact mode', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <ConditionCard condition={lockedCondition} premiumRenderState="unlocked" />,
    );

    const probabilityCardStyle = StyleSheet.flatten(
      getByTestId('condition-card-probability-card').props.style,
    );
    const probabilityValueStyle = StyleSheet.flatten(
      getByTestId('condition-card-probability-value').props.style,
    );

    expect(getByTestId('condition-card-probability-label').props.numberOfLines).toBe(2);
    expect(probabilityCardStyle.alignSelf).toBe('flex-start');
    expect(probabilityCardStyle.borderRadius).toBe(16);
    expect(probabilityValueStyle.fontSize).toBe(24);
  });
});
