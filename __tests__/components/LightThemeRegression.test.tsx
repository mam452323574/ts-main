import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ActionCard } from '@/components/ActionCard';
import { LIGHT_COLORS } from '@/constants/theme';

const MockIcon = (({ color }: { color: string }) => (
  <Text testID="light-theme-action-icon">{color}</Text>
)) as any;

describe('light theme regressions', () => {
  it('keeps secondary text readable in the light palette', () => {
    expect(LIGHT_COLORS.secondaryText).toBe(LIGHT_COLORS.textMuted);
    expect(LIGHT_COLORS.secondaryText).not.toBe(LIGHT_COLORS.white);
  });

  it('renders shared action cards with readable text in light mode', () => {
    render(
      <ActionCard
        title="Readable card"
        icon={MockIcon}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Readable card')).toHaveStyle({
      color: LIGHT_COLORS.primaryText,
    });
    expect(screen.getByTestId('light-theme-action-icon')).toHaveTextContent(
      LIGHT_COLORS.primary,
    );
  });
});
