import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ScanLimitIndicator } from '@/components/ScanLimitIndicator';
import { ScanEligibilityResponse } from '@/types';

describe('ScanLimitIndicator', () => {
  const NOW = Date.parse('2026-04-28T10:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  it('displays "Limite atteinte" when allowed is false', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: false,
      message: 'Limite atteinte',
      current_count: 3,
      limit: 3,
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('Limite atteinte')).toBeTruthy();
  });

  it('displays "disponible" when 1 scan remaining', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 2,
      limit: 3,
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('disponible')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // remaining count
  });

  it('displays "disponible" when 2 scans remaining', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 1,
      limit: 3,
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('disponible')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // remaining count
  });

  it('displays "disponible" when no scans used', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 0,
      limit: 3,
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('disponible')).toBeTruthy();
    // When remaining equals limit, both show '3', so use getAllByText
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('handles single scan limit correctly', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 0,
      limit: 1,
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('disponible')).toBeTruthy();
  });

  it('renders without crashing with minimal data', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'OK',
    };

    const { toJSON } = render(<ScanLimitIndicator eligibility={eligibility} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the next scan countdown along with the 0/limit counter when exhausted', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: false,
      message: 'Limite atteinte',
      current_count: 1,
      remaining: 0,
      limit: 1,
      next_recharge_at: NOW + (21 * 60 * 60 * 1000) + (14 * 60 * 1000),
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    // Le compteur "0/1" reste affiché pour que l'utilisateur comprenne
    // immédiatement qu'il a utilisé son scan (audit 2026-05).
    expect(screen.getByTestId('scan-limit-remaining')).toHaveTextContent('0');
    expect(screen.getByText('/')).toBeTruthy();
    // Le timer prend la place du libellé "Limite atteinte" : le texte du
    // statut ne doit pas être rendu en parallèle pour éviter le doublon.
    expect(screen.getByText('Nouveau scan dans 21h 14m')).toBeTruthy();
    expect(screen.queryByText('Limite atteinte')).toBeNull();
    expect(screen.queryByTestId('scan-limit-status')).toBeNull();
  });

  it('keeps showing the remaining stock for a partially used premium quota', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 1,
      remaining: 2,
      limit: 3,
      next_recharge_at: NOW + (6 * 60 * 60 * 1000) + (3 * 60 * 1000),
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('/')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('disponible')).toBeTruthy();
    expect(screen.queryByText(/Nouveau scan dans|\+1 dans/)).toBeNull();
  });

  it('keeps full premium quotas as available without a recharge timer', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 0,
      remaining: 3,
      limit: 3,
      next_recharge_at: NOW + (6 * 60 * 60 * 1000),
    };

    render(<ScanLimitIndicator eligibility={eligibility} />);

    expect(screen.getByText('disponible')).toBeTruthy();
    expect(screen.queryByText(/\+1 dans/)).toBeNull();
    expect(screen.queryByText(/Nouveau scan dans/)).toBeNull();
  });

  it('uses the homeCompact timer mode so the cooldown text can wrap on two lines', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: false,
      message: 'Limite atteinte',
      current_count: 1,
      remaining: 0,
      limit: 1,
      next_recharge_at: NOW + (23 * 60 * 60 * 1000) + (59 * 60 * 1000),
    };

    const { UNSAFE_getAllByType } = render(<ScanLimitIndicator eligibility={eligibility} />);

    // Le Text qui porte le cooldown doit autoriser 2 lignes (numberOfLines=2)
    // pour ne pas tronquer "Nouveau scan dans 23h 59m" dans une mini-card
    // étroite (audit 2026-05).
    const TextComp = require('react-native').Text;
    const cooldownText = UNSAFE_getAllByType(TextComp).find(
      (node: { props: { children?: unknown } }) =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('Nouveau scan dans'),
    );
    expect(cooldownText).toBeTruthy();
    expect(cooldownText!.props.numberOfLines).toBe(2);
  });

  it('shows the welcome credits badge when the eligibility carries welcome_credits and the user is not premium', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 0,
      remaining: 1,
      limit: 1,
      welcome_credits: 2,
    };

    render(<ScanLimitIndicator eligibility={eligibility} isPremium={false} />);

    expect(screen.getByTestId('scan-limit-welcome')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('falls back on remaining_welcome_credits when welcome_credits is absent', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'Scan autorisé',
      current_count: 0,
      remaining: 1,
      limit: 1,
      remaining_welcome_credits: 3,
    };

    render(<ScanLimitIndicator eligibility={eligibility} isPremium={false} />);

    expect(screen.getByText('+3')).toBeTruthy();
  });

  it('hides the welcome badge for premium users (they already have full quota)', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'OK',
      current_count: 0,
      remaining: 3,
      limit: 3,
      welcome_credits: 5,
    };

    render(<ScanLimitIndicator eligibility={eligibility} isPremium={true} />);

    expect(screen.queryByTestId('scan-limit-welcome')).toBeNull();
  });

  it('hides the welcome badge when welcome credits are zero', () => {
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: true,
      message: 'OK',
      current_count: 0,
      remaining: 1,
      limit: 1,
      welcome_credits: 0,
    };

    render(<ScanLimitIndicator eligibility={eligibility} isPremium={false} />);

    expect(screen.queryByTestId('scan-limit-welcome')).toBeNull();
  });

  it('calls onTimerComplete once when the direct recharge countdown reaches zero', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    const onTimerComplete = jest.fn();
    const eligibility: ScanEligibilityResponse = {
      success: true,
      allowed: false,
      message: 'Limite atteinte',
      current_count: 1,
      remaining: 0,
      limit: 1,
      next_recharge_at: NOW + 1000,
    };

    render(
      <ScanLimitIndicator
        eligibility={eligibility}
        onTimerComplete={onTimerComplete}
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(onTimerComplete).toHaveBeenCalledTimes(1);
  });
});
