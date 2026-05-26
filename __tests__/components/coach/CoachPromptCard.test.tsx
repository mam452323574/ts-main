import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachPromptCard } from '@/components/coach/CoachPromptCard';
import {
  DARK_COLORS,
  LIGHT_COLORS,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import {
  getCoachPromptPalette,
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
    accentColor: '#7FA9D4',
  },
  {
    promptType: 'weekly_plan',
    accentColor: '#C99A64',
  },
  {
    promptType: 'nutrition_focus',
    accentColor: '#72AFA8',
  },
  {
    promptType: 'body_focus',
    accentColor: '#8D9EC8',
  },
  {
    promptType: 'face_focus',
    accentColor: '#D98B86',
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

      expect(accentStyle.backgroundColor).toBe(withAlpha(accentColor, 0.46));
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
      expanded: false,
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

    const selectorArtworkFrame = screen.getByTestId(
      'coach-prompt-selector-subtitle-artwork-frame',
    );
    const selectorArtwork = screen.getByTestId(
      'coach-prompt-selector-subtitle-artwork',
    );
    const selectorArtworkFrameStyle = StyleSheet.flatten(
      selectorArtworkFrame.props.style,
    );
    const selectorArtworkStyle = StyleSheet.flatten(selectorArtwork.props.style);

    expect(screen.getByText("Today's priority")).toBeTruthy();
    expect(
      screen.getByText('What should I adjust first after my latest scan?'),
    ).toBeTruthy();
    expect(selectorArtworkFrame).toBeTruthy();
    expect(selectorArtworkFrameStyle.marginTop).toBe(-(SPACING.sm + 2));
    expect(selectorArtworkFrameStyle.marginHorizontal).toBe(-SPACING.md);
    expect(selectorArtworkFrameStyle.borderWidth).toBe(0);
    expect(selectorArtworkFrameStyle.backgroundColor).toBeUndefined();
    expect(selectorArtworkFrameStyle.height).toBe(142);
    expect(selectorArtwork).toBeTruthy();
    // `latest_scan` declares `crop: { imageScale: 1.1 }` to give the centred
    // compass artwork more presence inside the frame.
    expect(selectorArtworkStyle.transform).toEqual([{ scale: 1.1 }]);
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
    expect(screen.getByTestId('coach-prompt-selector-artwork')).toBeTruthy();
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
      expanded: false,
    });
  });

  it('can show selector cards as expanded without marking them selected', () => {
    render(
      <CoachPromptCard
        promptType="latest_scan"
        title="Latest scan"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        expanded
        testID="coach-prompt-selector-expanded"
      />,
    );

    expect(
      screen.getByTestId('coach-prompt-selector-expanded').props
        .accessibilityState,
    ).toEqual({
      disabled: false,
      busy: false,
      selected: false,
      expanded: true,
    });
    expect(
      screen.queryByTestId('coach-prompt-selector-expanded-selected-badge'),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        'coach-prompt-selector-expanded-contains-selection-indicator',
      ),
    ).toBeNull();
  });

  it('can show that a selector card contains a selected child without reusing the selected state', () => {
    render(
      <CoachPromptCard
        promptType="weekly_plan"
        title="Weekly plan"
        onPress={jest.fn()}
        variant="compact"
        mode="selector"
        containsSelectedQuestion
        testID="coach-prompt-selector-child-selection"
      />,
    );

    expect(
      screen.getByTestId('coach-prompt-selector-child-selection').props
        .accessibilityState,
    ).toEqual({
      disabled: false,
      busy: false,
      selected: false,
      expanded: false,
    });
    expect(
      screen.queryByTestId(
        'coach-prompt-selector-child-selection-selected-badge',
      ),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-prompt-selector-child-selection-contains-selection-indicator',
      ),
    ).toBeTruthy();
  });

  it('keeps selector artwork visible under premium lock chrome', () => {
    render(
      <CoachPromptCard
        promptType="weekly_plan"
        title="Weekly plan"
        subtitle="Build a simple seven-day rhythm."
        onPress={jest.fn()}
        mode="selector"
        locked
        lockedBadgeLabel="Premium"
        lockedHint="Tap to unlock"
        testID="coach-prompt-selector-locked"
      />,
    );

    const lockedArtworkFrame = screen.getByTestId(
      'coach-prompt-selector-locked-artwork-frame',
    );
    const lockedArtworkFrameStyle = StyleSheet.flatten(
      lockedArtworkFrame.props.style,
    );

    expect(screen.getByTestId('coach-prompt-selector-locked-artwork')).toBeTruthy();
    expect(lockedArtworkFrameStyle.marginTop).toBe(-(SPACING.sm + 2));
    expect(lockedArtworkFrameStyle.marginHorizontal).toBe(-SPACING.md);
    expect(lockedArtworkFrameStyle.borderWidth).toBe(0);
    expect(lockedArtworkFrameStyle.backgroundColor).toBeUndefined();
    expect(lockedArtworkFrameStyle.height).toBe(154);
    expect(screen.getByTestId('coach-prompt-selector-locked-lock-scrim')).toBeTruthy();
    expect(screen.getByTestId('coach-prompt-selector-locked-lock-badge')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
  });

  it('uses stronger selector surfaces in light mode without washing out the icon', () => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;

    const promptType: CoachPromptType = 'hydration_focus';
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

    expect(screen.getByTestId('coach-prompt-selector-light-artwork')).toBeTruthy();
    expect(idleStyle.backgroundColor).toBe(palette.selectorBackgroundColor);
    expect(idleStyle.borderColor).toBe(palette.selectorBorderColor);
    expect(palette.selectorPressedBackgroundColor).not.toBe(
      palette.selectorBackgroundColor,
    );
    expect(idleIconStyle.backgroundColor).toBe(
      palette.selectorIconBackgroundColor,
    );
    expect(
      screen.getByTestId('coach-prompt-selector-light-icon-glyph').props.color,
    ).toBe(palette.selectorIconColor);
    expect(idleBackdrop.props.colors).toEqual(palette.selectorBackdropColors);

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
      palette.selectorSelectedBackgroundColor,
    );
    expect(selectedStyle.borderColor).toBe(palette.selectorSelectedBorderColor);
    expect(selectedIconStyle.backgroundColor).toBe(
      palette.selectorSelectedIconBackgroundColor,
    );
    expect(selectedBackdrop.props.colors).toEqual(
      palette.selectorSelectedBackdropColors,
    );
    expect(selectedBadgeStyle.backgroundColor).toBe(
      palette.selectorSelectedBadgeColor,
    );
    expect(selectedBadgeStyle.borderColor).toBe(
      palette.selectorSelectedBadgeBorderColor,
    );
    expect(
      screen.getByTestId('coach-prompt-selector-light-selected-icon').props.color,
    ).toBe(LIGHT_COLORS.white);
    expect(
      getContrast(palette.selectorIconColor, selectedIconStyle.backgroundColor),
    ).toBeGreaterThanOrEqual(3);
    expect(
      getContrast(LIGHT_COLORS.white, palette.selectorSelectedBadgeColor),
    ).toBeGreaterThanOrEqual(4);
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
