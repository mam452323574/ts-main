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

  it('displays a direct recharge countdown for an exhausted free quota', () => {
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

    expect(screen.getByText('Recharge 21h 14m')).toBeTruthy();
    expect(screen.queryByText('Limite atteinte')).toBeNull();
  });

  it('displays the next individual recharge for a partially used premium quota', () => {
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

    expect(screen.getByText('+1 dans 06h 03m')).toBeTruthy();
    expect(screen.queryByText('disponible')).toBeNull();
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
