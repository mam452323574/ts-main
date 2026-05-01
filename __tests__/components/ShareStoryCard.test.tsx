import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { ShareStoryCard } from '@/components/share/ShareStoryCard';
import { ShareStoryPayload } from '@/types';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primaryText: '#F8FAFC',
      white: '#FFFFFF',
    },
    isDark: true,
  }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, props, children);
  },
}));

jest.mock('react-native-svg', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  const MockSvgComponent = ({ children, ...props }: any) =>
    ReactLocal.createElement(View, props, children);

  return {
    __esModule: true,
    default: MockSvgComponent,
    Circle: MockSvgComponent,
    Defs: MockSvgComponent,
    LinearGradient: MockSvgComponent,
    Stop: MockSvgComponent,
  };
});

const basePayload: ShareStoryPayload = {
  variant: 'face',
  variantLabel: 'Visage',
  score: 83,
  scoreLabel: 'Score',
  heroImageUri: 'file:///hero.jpg',
  metrics: [
    { label: 'Âge perçu', value: '27 ans', valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
    { label: 'Symétrie', value: '91%', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
    { label: 'Énergie', value: '82', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
  ],
  accentColor: '#0A84FF',
  accentColorSecondary: '#5B8DEF',
  footerBrand: 'HEALTH SCAN',
  footerCta: '',
};

function createPayload(overrides: Partial<ShareStoryPayload>): ShareStoryPayload {
  return {
    ...basePayload,
    ...overrides,
    metrics: overrides.metrics ?? basePayload.metrics,
  };
}

describe('ShareStoryCard', () => {
  it.each([
    createPayload({
      variant: 'face',
      variantLabel: 'Visage',
      score: 7,
    }),
    createPayload({
      variant: 'body',
      variantLabel: 'Body',
      score: 100,
      accentColor: '#63E6BE',
      metrics: [
        { label: 'Metabolic age', value: '31 yrs', valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
        { label: 'Symmetry', value: '85', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Strength', value: '100', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ],
    }),
    createPayload({
      variant: 'nutrition',
      variantLabel: 'Nutrición',
      score: 75,
      accentColor: '#5FD3BC',
      accentColorSecondary: '#0F766E',
      metrics: [
        { label: 'Calories', value: '410', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Satiety', value: '8/10', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Quality', value: 'Ultraprocesado', valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
      ],
    }),
    createPayload({
      variant: 'super',
      variantLabel: 'Super Scan',
      score: 70,
      scoreLabel: 'Risk',
      accentColor: '#1F4E79',
      accentColorSecondary: '#5B8DEF',
      statusBadgeLabel: 'AI Report',
      statusTone: 'neutral',
      metrics: [
        { label: 'Risk', value: '70/100', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Urgency', value: 'Stable', valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
        { label: 'Conditions', value: '1', valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
      ],
    }),
  ])('keeps the 4-zone card structure stable for %s', (payload) => {
    const { getByTestId, getByText, queryByTestId } = render(
      <ShareStoryCard payload={payload} cardWidth={320} testID="share-story-card" />,
    );

    expect(getByTestId('share-story-card')).toBeTruthy();
    expect(getByTestId('share-story-body')).toBeTruthy();
    expect(getByTestId('share-story-header-row')).toBeTruthy();
    expect(getByTestId('share-story-hero-section')).toBeTruthy();
    expect(getByTestId('share-story-metrics-row')).toBeTruthy();
    expect(getByTestId('share-story-footer')).toBeTruthy();
    expect(getByText('HEALTH SCAN')).toBeTruthy();
    expect(getByTestId('share-story-primary-score').props.numberOfLines).toBe(1);

    if (payload.statusBadgeLabel) {
      expect(getByTestId('share-story-status-badge')).toBeTruthy();
    } else {
      expect(queryByTestId('share-story-status-badge')).toBeNull();
    }
  });

  it('reserves a shared two-line label slot for short and long labels on small cards', () => {
    const payload = createPayload({
      variant: 'body',
      variantLabel: 'Corps',
      score: 100,
      metrics: [
        { label: 'Force', value: '85', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Edad metabólica', value: '31 años', valueVariant: 'text', labelMaxLines: 2, valueMaxLines: 2 },
        { label: 'Perceived age', value: '27 yrs', valueVariant: 'text', labelMaxLines: 2, valueMaxLines: 2 },
      ],
    });

    const { getByTestId, getByText } = render(<ShareStoryCard payload={payload} cardWidth={272} />);
    const wrap0 = StyleSheet.flatten(getByTestId('share-story-metric-label-wrap-0').props.style);
    const wrap1 = StyleSheet.flatten(getByTestId('share-story-metric-label-wrap-1').props.style);
    const wrap2 = StyleSheet.flatten(getByTestId('share-story-metric-label-wrap-2').props.style);
    const longLabel = getByText('Edad metabólica');

    expect(wrap0.minHeight).toBe(wrap1.minHeight);
    expect(wrap1.minHeight).toBe(wrap2.minHeight);
    expect(longLabel.props.numberOfLines).toBe(2);
    expect(longLabel.props.android_hyphenationFrequency).toBe('none');
    expect(longLabel.props.lineBreakStrategyIOS).toBe('standard');
    expect(longLabel.props.textBreakStrategy).toBe('simple');
    expect(longLabel.props.adjustsFontSizeToFit).toBeUndefined();
  });

  it.each([
    ['fr', 'Ultra-transformé'],
    ['en', 'Ultra-processed'],
    ['es', 'Ultraprocesado'],
    ['de', 'Stark verarbeitet'],
  ])('keeps long quality values readable in %s without clipping the footer', (_locale, qualityValue) => {
    const payload = createPayload({
      variant: 'nutrition',
      variantLabel: 'Nutrition',
      score: 75,
      accentColor: '#5FD3BC',
      accentColorSecondary: '#0F766E',
      metrics: [
        { label: 'Calories', value: '410', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Quality', value: qualityValue, valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
        { label: 'Satiété', value: '8/10', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
      ],
    });

    const { getByTestId, getByText } = render(<ShareStoryCard payload={payload} cardWidth={268} />);
    const quality = getByText(qualityValue);
    const footerStyle = StyleSheet.flatten(getByTestId('share-story-footer').props.style);

    expect(quality.props.numberOfLines).toBe(2);
    expect(quality.props.adjustsFontSizeToFit).toBeUndefined();
    expect(quality.props.minimumFontScale).toBeUndefined();
    expect(quality.props.android_hyphenationFrequency).toBe('none');
    expect(quality.props.textBreakStrategy).toBe('simple');
    expect(footerStyle.minHeight).toBeGreaterThan(38);
    expect(getByText('HEALTH SCAN')).toBeTruthy();
  });

  it('gives text metrics more width for long single-word values without destabilizing the footer', () => {
    const payload = createPayload({
      variant: 'nutrition',
      variantLabel: 'Nutrition',
      score: 75,
      accentColor: '#5FD3BC',
      accentColorSecondary: '#0F766E',
      metrics: [
        { label: 'Calories', value: '410', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Quality', value: 'Ultraprocesado', valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
        { label: 'Satiety', value: '8/10', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
      ],
    });

    const { getByTestId, getByText } = render(<ShareStoryCard payload={payload} cardWidth={268} />);
    const numericColumnStyle = StyleSheet.flatten(getByTestId('share-story-metric-0').props.style);
    const textColumnStyle = StyleSheet.flatten(getByTestId('share-story-metric-1').props.style);
    const fractionColumnStyle = StyleSheet.flatten(getByTestId('share-story-metric-2').props.style);
    const footerStyle = StyleSheet.flatten(getByTestId('share-story-footer').props.style);
    const qualityValue = getByText('Ultraprocesado');

    expect(textColumnStyle.flex).toBeGreaterThan(numericColumnStyle.flex);
    expect(textColumnStyle.flex).toBeGreaterThan(fractionColumnStyle.flex);
    expect(qualityValue.props.adjustsFontSizeToFit).toBeUndefined();
    expect(qualityValue.props.numberOfLines).toBe(2);
    expect(footerStyle.minHeight).toBeGreaterThan(38);
  });

  it.each([
    createPayload({
      variant: 'face',
      variantLabel: 'Visage',
      score: 7,
    }),
    createPayload({
      variant: 'body',
      variantLabel: 'Body',
      score: 100,
      accentColor: '#63E6BE',
      metrics: [
        { label: 'Metabolic age', value: '31 yrs', valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
        { label: 'Symmetry', value: '85', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Strength', value: '100', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ],
    }),
    createPayload({
      variant: 'nutrition',
      variantLabel: 'NutriciÃ³n',
      score: 75,
      accentColor: '#5FD3BC',
      accentColorSecondary: '#0F766E',
      metrics: [
        { label: 'Calories', value: '410', valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Satiety', value: '8/10', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Quality', value: 'Ultraprocesado', valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
      ],
    }),
    createPayload({
      variant: 'super',
      variantLabel: 'Super Scan',
      score: 70,
      scoreLabel: 'Risk',
      accentColor: '#1F4E79',
      accentColorSecondary: '#5B8DEF',
      statusBadgeLabel: 'AI Report',
      statusTone: 'neutral',
      metrics: [
        { label: 'Risk', value: '70/100', valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
        { label: 'Urgency', value: 'Stable', valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
        { label: 'Conditions', value: '1', valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
      ],
    }),
  ])('applies the shared footer lift for %s variants', (payload) => {
    const { getByTestId } = render(<ShareStoryCard payload={payload} cardWidth={360} />);
    const footerStyle = StyleSheet.flatten(getByTestId('share-story-footer').props.style);

    expect(footerStyle.paddingBottom).toBe(6);
    expect(footerStyle.minHeight).toBe(54);
  });

  it.each([7, 100])('keeps score %s aligned on the baseline-safe row', (score) => {
    const payload = createPayload({ score });
    const { getByTestId } = render(<ShareStoryCard payload={payload} cardWidth={320} />);
    const scoreRow = getByTestId('share-story-score-row');
    const scoreSuffix = getByTestId('share-story-score-suffix');
    const scoreStyle = StyleSheet.flatten(getByTestId('share-story-primary-score').props.style);
    const suffixStyle = StyleSheet.flatten(scoreSuffix.props.style);

    expect(scoreRow).toHaveStyle({ alignItems: 'baseline' });
    expect(getByTestId('share-story-primary-score').props.numberOfLines).toBe(1);
    expect(suffixStyle.lineHeight).toBeLessThan(scoreStyle.lineHeight);
  });

  it('maps the hero and feature surfaces to the shared radius scale', () => {
    const { getByTestId } = render(
      <ShareStoryCard payload={basePayload} cardWidth={360} testID="share-story-card" />,
    );

    const cardStyle = StyleSheet.flatten(getByTestId('share-story-card').props.style);
    const metricsStyle = StyleSheet.flatten(getByTestId('share-story-metrics-row').props.style);
    const ringContainerStyle = StyleSheet.flatten(
      getByTestId('share-story-ring-container').props.style,
    );
    const heroFrameStyle = StyleSheet.flatten(
      getByTestId('share-story-hero-image-frame').props.style,
    );

    expect(cardStyle.borderRadius).toBe(28);
    expect(metricsStyle.borderRadius).toBe(22);
    expect(ringContainerStyle.maxWidth).toBeGreaterThan(metricsStyle.minHeight * 2);
    expect(heroFrameStyle.minWidth).toBeGreaterThan(metricsStyle.minHeight);
  });
});
