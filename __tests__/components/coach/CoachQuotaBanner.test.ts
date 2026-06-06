import React from 'react';
import { render, screen } from '@testing-library/react-native';

import {
  CoachQuotaBanner,
  resolveCoachQuotaBannerKind,
  type CoachQuotaBannerKind,
} from '@/components/coach/chat/CoachQuotaBanner';
import { DARK_COLORS, LIGHT_COLORS, getThemeTokens } from '@/constants/theme';
import type { CoachConversationQuotaStatus } from '@/shared/coachConversation';

jest.mock('lucide-react-native', () => ({
  MessageCircle: ({ testID, ...props }: { testID?: string }) => {
    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, {
        ...props,
        testID: `message-circle-${testID ?? 'icon'}`,
      });
  },
}));

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

function makeQuota(
  overrides: Partial<CoachConversationQuotaStatus> = {},
): CoachConversationQuotaStatus {
  return {
    tier: 'free',
    account_tier: 'free',
    unlimited: false,
    window_seconds: 259_200,
    premium_today_used: 0,
    premium_today_limit: null,
    premium_today_available: null,
    next_recharge_at: null,
    per_conversation_limit: 20,
    free_used: false,
    free_message_limit: 4,
    free_used_count: 0,
    free_remaining_messages: 4,
    free_next_recharge_at: null,
    free_window_seconds: 259_200,
    free_conversation_id: null,
    quota_exceeded: false,
    as_of: '2026-05-26T10:00:00.000Z',
    last_conversation_by_persona: {},
    conversation_count_by_persona: {},
    ...overrides,
  };
}

describe('resolveCoachQuotaBannerKind (rolling free quota)', () => {
  it('returns null when quota is missing', () => {
    expect(resolveCoachQuotaBannerKind(null)).toBeNull();
    expect(resolveCoachQuotaBannerKind(undefined)).toBeNull();
  });

  it('returns null for admin tier (no banner needed)', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({ tier: 'admin', account_tier: 'admin' }),
      ),
    ).toBeNull();
  });

  it('returns free_active when many free messages remain', () => {
    expect(
      resolveCoachQuotaBannerKind(makeQuota({ free_remaining_messages: 4 })),
    ).toBe('free_active');
    expect(
      resolveCoachQuotaBannerKind(makeQuota({ free_remaining_messages: 2 })),
    ).toBe('free_active');
  });

  it('returns free_warning on the last free message', () => {
    expect(
      resolveCoachQuotaBannerKind(makeQuota({ free_remaining_messages: 1 })),
    ).toBe('free_warning');
  });

  it('returns free_exhausted when remaining is 0', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({ free_remaining_messages: 0, free_used: true }),
      ),
    ).toBe('free_exhausted');
  });

  it('returns free_exhausted when quota_exceeded is true even with remaining > 0', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({ free_remaining_messages: 1, quota_exceeded: true }),
      ),
    ).toBe('free_exhausted');
  });

  it('returns premium_normal for premium with plenty of headroom', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({
          tier: 'premium',
          account_tier: 'premium',
          premium_today_available: 20,
          premium_today_limit: 40,
        }),
      ),
    ).toBe('premium_normal');
  });

  it('returns premium_warning when close to the daily cap', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({
          tier: 'premium',
          account_tier: 'premium',
          premium_today_available: 3,
          premium_today_limit: 40,
        }),
      ),
    ).toBe('premium_warning');
  });

  it('returns premium_exhausted when the daily cap is reached', () => {
    expect(
      resolveCoachQuotaBannerKind(
        makeQuota({
          tier: 'premium',
          account_tier: 'premium',
          premium_today_available: 0,
          premium_today_limit: 40,
        }),
      ),
    ).toBe('premium_exhausted');
  });
});

describe('CoachQuotaBanner', () => {
  beforeEach(() => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it.each<CoachQuotaBannerKind>([
    'premium_normal',
    'premium_warning',
    'premium_exhausted',
    'free_active',
    'free_warning',
    'free_exhausted',
  ])('uses a neutral message icon for %s', (kind) => {
    const testID = `quota-${kind}`;
    render(
      React.createElement(CoachQuotaBanner, {
        kind,
        title: 'Quota',
        testID,
      }),
    );

    expect(screen.getByTestId(`message-circle-${testID}-icon`)).toBeTruthy();
  });

  it('renders an exhausted information banner without a premium CTA', () => {
    render(
      React.createElement(CoachQuotaBanner, {
        kind: 'free_exhausted',
        title: 'Messages gratuits : 0/4',
        body: 'Recharge gratuite dans 3 jours',
        ctaLabel: null,
        onPress: null,
        testID: 'quota-exhausted',
      }),
    );

    expect(screen.queryByText('Passer premium')).toBeNull();
    expect(screen.getByTestId('quota-exhausted').props.accessibilityRole).toBeUndefined();
  });

  it('uses a contrast-safe exhausted foreground in light mode', () => {
    render(
      React.createElement(CoachQuotaBanner, {
        kind: 'premium_exhausted',
        title: 'Limite atteinte',
        ctaLabel: 'Premium',
        testID: 'quota-light-exhausted',
      }),
    );

    expect(screen.getByTestId('message-circle-quota-light-exhausted-icon').props.color).toBe(
      getThemeTokens(false).premium.foreground,
    );
    expect(screen.getByText('Premium')).toHaveStyle({
      color: getThemeTokens(false).premium.foreground,
    });
  });

  it('keeps the exhausted gold foreground in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;

    render(
      React.createElement(CoachQuotaBanner, {
        kind: 'premium_exhausted',
        title: 'Limite atteinte',
        ctaLabel: 'Premium',
        testID: 'quota-dark-exhausted',
      }),
    );

    expect(screen.getByTestId('message-circle-quota-dark-exhausted-icon').props.color).toBe(
      DARK_COLORS.gold,
    );
    expect(screen.getByText('Premium')).toHaveStyle({ color: DARK_COLORS.gold });
  });
});
