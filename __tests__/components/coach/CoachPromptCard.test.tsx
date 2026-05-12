import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachPromptCard } from '@/components/coach/CoachPromptCard';
import {
  DARK_COLORS,
  LIGHT_COLORS,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import {
  getCoachPromptPalette,
  getCoachPromptVisual,
} from '@/shared/coachPromptVisuals';
import type { CoachPromptType } from '@/types';

const mockThemeState = {
  colors: DARK_COLORS,
  isDark: true,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

const PROMPT_CASES: ReadonlyArray<{
  promptType: CoachPromptType;
  accentColor: string;
}> = [
  {
    promptType: 'latest_scan',
    accentColor: '#6CA7FF',
  },
  {
    promptType: 'weekly_plan',
    accentColor: '#FFB85C',
  },
  {
    promptType: 'nutrition_focus',
    accentColor: '#53C6BB',
  },
  {
    promptType: 'body_focus',
    accentColor: '#88A7FF',
  },
  {
    promptType: 'face_focus',
    accentColor: '#FF8F8B',
  },
];

describe('CoachPromptCard', () => {
  beforeEach(() => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;
  });

  it.each(PROMPT_CASES)(
    'renders premium prompt chrome for $promptType',
    ({ promptType, accentColor }) => {
      const testID = `coach-prompt-${promptType}`;

      render(
        <CoachPromptCard
          promptType={promptType}
          title={`Title ${promptType}`}
          subtitle={`Subtitle ${promptType}`}
          onPress={jest.fn()}
          testID={testID}
        />,
      );

      expect(screen.getByTestId(testID)).toBeTruthy();
      expect(screen.getByTestId(`${testID}-icon`)).toBeTruthy();
      expect(screen.getByTestId(`${testID}-icon-glyph`)).toBeTruthy();
      expect(screen.getByTestId(`${testID}-chevron`)).toBeTruthy();
      expect(screen.getByTestId(`${testID}-trailing`)).toBeTruthy();

      const accentStyle = StyleSheet.flatten(
        screen.getByTestId(`${testID}-accent`).props.style,
      );

      expect(accentStyle.backgroundColor).toBe(withAlpha(accentColor, 0.72));
      expect(screen.getByText(`Title ${promptType}`)).toBeTruthy();
      expect(screen.getByText(`Subtitle ${promptType}`)).toBeTruthy();
    },
  );

  it('swaps the chevron for a spinner and blocks presses while busy', () => {
    const onPress = jest.fn();

    render(
      <CoachPromptCard
        promptType="weekly_plan"
        title="Weekly plan"
        subtitle="Simple seven-day rhythm."
        onPress={onPress}
        busy
        testID="coach-prompt-busy"
      />,
    );

    fireEvent.press(screen.getByTestId('coach-prompt-busy'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('coach-prompt-busy-spinner')).toBeTruthy();
    expect(screen.queryByTestId('coach-prompt-busy-chevron')).toBeNull();
    expect(screen.getByTestId('coach-prompt-busy').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
      selected: false,
    });
  });

  it('renders the compact variant for secondary coach actions', () => {
    render(
      <CoachPromptCard
        promptType="nutrition_focus"
        title="Nutrition focus"
        subtitle="Keep meals regular."
        onPress={jest.fn()}
        variant="compact"
        testID="coach-prompt-compact"
      />,
    );

    expect(screen.getByTestId('coach-prompt-compact')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-compact-icon')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-compact-chevron')).toBeTruthy();
    expect(screen.getByText('Nutrition focus')).toBeTruthy();
    expect(screen.getByText('Keep meals regular.')).toBeTruthy();
  });

  it('renders selector mode subtitles when provided', () => {
    render(
      <CoachPromptCard
        promptType="latest_scan"
        title="Today's priority"
        subtitle="What should I adjust first after my latest scan?"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        testID="coach-prompt-selector-subtitle"
      />,
    );

    expect(screen.getByText("Today's priority")).toBeTruthy();
    expect(
      screen.getByText('What should I adjust first after my latest scan?'),
    ).toBeTruthy();
    expect(screen.queryByTestId('coach-prompt-selector-subtitle-chevron')).toBeNull();
  });

  it('renders selector mode without subtitle or chevron and highlights the selected state', () => {
    render(
      <CoachPromptCard
        promptType="face_focus"
        title="Face focus"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        selected
        testID="coach-prompt-selector"
      />,
    );

    expect(screen.getByTestId('coach-prompt-selector')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-selector-icon')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-selector-selected-badge')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-selector-selected-icon')).toBeTruthy();
    expect(screen.queryByTestId('coach-prompt-selector-chevron')).toBeNull();
    expect(screen.queryByTestId('coach-prompt-selector-trailing')).toBeNull();
    expect(screen.queryByText('Keep meals regular.')).toBeNull();
    expect(screen.getByText('Face focus')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-selector').props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
      selected: true,
    });
  });

  it('uses stronger selector surfaces in light mode without washing out the icon', () => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;

    const promptType: CoachPromptType = 'hydration_focus';
    const accentColor = getCoachPromptVisual(promptType).accentColor;
    const accentStrong = mixColors(accentColor, LIGHT_COLORS.primaryText, 0.42);

    const palette = getCoachPromptPalette(promptType, LIGHT_COLORS, false);

    const { rerender } = render(
      <CoachPromptCard
        promptType={promptType}
        title="Hydration"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        testID="coach-prompt-selector-light"
      />,
    );

    const selectorTile = screen.getByTestId('coach-prompt-selector-light');
    const idleStyle = StyleSheet.flatten(selectorTile.props.style);
    const idleIconStyle = StyleSheet.flatten(
      screen.getByTestId('coach-prompt-selector-light-icon').props.style,
    );
    const idleBackdrop = screen.getByTestId('coach-prompt-selector-light-backdrop');

    expect(idleStyle.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, accentStrong, 0.16),
    );
    expect(idleStyle.borderColor).toBe(
      mixColors(LIGHT_COLORS.borderSubtle, accentStrong, 0.44),
    );
    expect(palette.selectorPressedBackgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, accentStrong, 0.22),
    );
    expect(palette.selectorPressedBorderColor).toBe(
      mixColors(LIGHT_COLORS.borderStrong, accentStrong, 0.54),
    );
    expect(palette.selectorPressedBackgroundColor).not.toBe(
      palette.selectorBackgroundColor,
    );
    expect(idleIconStyle.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, accentStrong, 0.12),
    );
    expect(
      screen.getByTestId('coach-prompt-selector-light-icon-glyph').props.color,
    ).toBe(accentStrong);
    expect(idleBackdrop.props.colors).toEqual([
      withAlpha(accentStrong, 0.09),
      withAlpha(accentStrong, 0.02),
    ]);

    rerender(
      <CoachPromptCard
        promptType={promptType}
        title="Hydration"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        selected
        testID="coach-prompt-selector-light"
      />,
    );

    const selectedStyle = StyleSheet.flatten(
      screen.getByTestId('coach-prompt-selector-light').props.style,
    );
    const selectedIconStyle = StyleSheet.flatten(
      screen.getByTestId('coach-prompt-selector-light-icon').props.style,
    );
    const selectedBadgeStyle = StyleSheet.flatten(
      screen.getByTestId('coach-prompt-selector-light-selected-badge').props.style,
    );
    const selectedBackdrop = screen.getByTestId('coach-prompt-selector-light-backdrop');

    expect(selectedStyle.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, accentStrong, 0.28),
    );
    expect(selectedStyle.borderColor).toBe(
      mixColors(LIGHT_COLORS.borderStrong, accentStrong, 0.62),
    );
    expect(selectedIconStyle.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, accentStrong, 0.16),
    );
    expect(selectedBackdrop.props.colors).toEqual([
      withAlpha(accentStrong, 0.14),
      withAlpha(accentStrong, 0.03),
    ]);
    expect(selectedBadgeStyle.backgroundColor).toBe(accentStrong);
    expect(selectedBadgeStyle.borderColor).toBe(
      withAlpha(LIGHT_COLORS.cardBackground, 0.92),
    );
    expect(
      screen.getByTestId('coach-prompt-selector-light-selected-icon').props.color,
    ).toBe(LIGHT_COLORS.white);
    expect(getContrast(accentStrong, selectedIconStyle.backgroundColor)).toBeGreaterThanOrEqual(
      3,
    );
    expect(getContrast(LIGHT_COLORS.white, accentStrong)).toBeGreaterThanOrEqual(4);
  });
});

function getContrast(colorA: string, colorB: string) {
  const luminanceA = getLuminance(colorA);
  const luminanceB = getLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );

  return 0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b);
}

function toLinearChannel(channel: number) {
  const normalized = channel / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}
