import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { NextScanTimer } from '@/components/NextScanTimer';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Clock: 'Clock',
}));

describe('NextScanTimer', () => {
  const NOW = new Date('2026-04-28T10:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    const futureDate = NOW + 3600000; // 1 hour from now
    const { toJSON } = render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    expect(toJSON()).toBeTruthy();
  });

  it('shows "Disponible" when time has passed', () => {
    const pastDate = NOW - 1000; // 1 second ago
    render(
      <NextScanTimer nextAvailableDate={pastDate} scanLabel="Nutrition" />
    );
    
    expect(screen.getByText('Disponible')).toBeTruthy();
  });

  it('shows time remaining when not available', () => {
    const futureDate = NOW + 3600000; // 1 hour from now
    render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    // Should show "dans X" format
    expect(screen.getByText(/dans/)).toBeTruthy();
  });

  it('shows hours and minutes format for hour+ durations', () => {
    const futureDate = NOW + (2 * 60 * 60 * 1000) + (30 * 60 * 1000); // 2h30m from now
    render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    expect(screen.getByText(/dans/)).toBeTruthy();
  });

  it('shows minutes format for sub-hour durations', () => {
    const futureDate = NOW + (30 * 60 * 1000); // 30 minutes from now
    render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    expect(screen.getByText(/dans/)).toBeTruthy();
  });

  it('shows days format for day+ durations', () => {
    const futureDate = NOW + (2 * 24 * 60 * 60 * 1000); // 2 days from now
    render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    expect(screen.getByText(/dans/)).toBeTruthy();
  });

  it('renders the homeCompact mode on two lines without a Clock icon', () => {
    const futureDate = NOW + (23 * 60 * 60 * 1000) + (59 * 60 * 1000);
    const { UNSAFE_queryByType, UNSAFE_getAllByType } = render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="homeCompact"
        scanLabel="Nouveau scan dans"
        padHours
      />,
    );

    // Texte concaténé "label + durée", pas le "dans" du mode par défaut
    expect(screen.getByText('Nouveau scan dans 23h 59m')).toBeTruthy();
    // Pas d'icône Clock en homeCompact (gain de place dans la mini-card)
    expect(UNSAFE_queryByType('Clock' as any)).toBeNull();
    // Le rendu doit autoriser 2 lignes pour éviter le tronquage du texte long
    const TextComp = require('react-native').Text;
    const allTexts = UNSAFE_getAllByType(TextComp);
    const cooldown = allTexts.find(
      (node: { props: { children?: unknown } }) =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('Nouveau scan dans'),
    );
    expect(cooldown).toBeTruthy();
    expect(cooldown!.props.numberOfLines).toBe(2);
  });

  it('renders the compact scanner mode on a single line without the default prefix', () => {
    const futureDate = NOW + (23 * 60 * 60 * 1000) + (59 * 60 * 1000);
    const { UNSAFE_queryByType } = render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerCompact"
      />
    );

    expect(screen.getByText('23h 59m')).toBeTruthy();
    expect(screen.queryByText(/dans/)).toBeNull();
    expect(UNSAFE_queryByType('Clock' as any)).toBeNull();
  });

  it('renders a scanner recharge label when provided', () => {
    const futureDate = NOW + (22 * 60 * 60 * 1000) + (14 * 60 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerCompact"
        scanLabel="Recharge"
      />,
    );

    expect(screen.getByText('Recharge 22h 14m')).toBeTruthy();
  });

  it('renders chip compact mode with a clock and no recharge prefix', () => {
    const futureDate = NOW + (23 * 60 * 60 * 1000) + (59 * 60 * 1000);
    const { UNSAFE_getByType } = render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerChipCompact"
        scanLabel="Recharge dans"
      />,
    );

    expect(screen.getByText('23h59')).toBeTruthy();
    expect(screen.queryByText(/Recharge/)).toBeNull();
    expect(screen.queryByText(/dans/)).toBeNull();
    expect(UNSAFE_getByType('Clock' as any)).toBeTruthy();
  });

  it('ignores partial recharge labels in chip compact mode', () => {
    const futureDate = NOW + (5 * 60 * 60 * 1000) + (42 * 60 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerChipCompact"
        scanLabel="+1 dans"
      />,
    );

    expect(screen.getByText('5h42')).toBeTruthy();
    expect(screen.queryByText(/\+1/)).toBeNull();
    expect(screen.queryByText(/dans/)).toBeNull();
  });

  it('renders sub-hour chip compact durations as minutes', () => {
    const futureDate = NOW + (58 * 60 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerChipCompact"
      />,
    );

    expect(screen.getByText('58m')).toBeTruthy();
  });

  it('rounds sub-minute chip compact durations up to one minute', () => {
    const futureDate = NOW + (30 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerChipCompact"
      />,
    );

    expect(screen.getByText('1m')).toBeTruthy();
  });

  it('pads scanner hours for premium partial recharge labels', () => {
    const futureDate = NOW + (5 * 60 * 60 * 1000) + (42 * 60 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerCompact"
        scanLabel="+1 dans"
        padHours
      />,
    );

    expect(screen.getByText('+1 dans 05h 42m')).toBeTruthy();
  });

  it('pads scanner minutes for premium partial recharge labels', () => {
    const futureDate = NOW + (6 * 60 * 60 * 1000) + (3 * 60 * 1000);

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerCompact"
        scanLabel="+1 dans"
        padHours
      />,
    );

    expect(screen.getByText('+1 dans 06h 03m')).toBeTruthy();
  });

  it('respects the server clock offset', () => {
    const serverNow = NOW + 5 * 60 * 1000;
    const futureDate = serverNow + 59 * 60 * 1000;

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        mode="scannerCompact"
        serverClockOffsetMs={5 * 60 * 1000}
      />
    );

    expect(screen.getByText('59m')).toBeTruthy();
  });

  it('calls onTimerComplete only once for the current deadline', async () => {
    const onTimerComplete = jest.fn();
    const futureDate = NOW + 1000;

    render(
      <NextScanTimer
        nextAvailableDate={futureDate}
        onTimerComplete={onTimerComplete}
        mode="scannerCompact"
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(onTimerComplete).toHaveBeenCalledTimes(1);
  });

  it('updates when time passes', async () => {
    const futureDate = NOW + 5000; // 5 seconds from now
    render(
      <NextScanTimer nextAvailableDate={futureDate} scanLabel="Nutrition" />
    );
    
    // Initially should show countdown
    expect(screen.getByText(/dans/)).toBeTruthy();
    
    // Fast-forward time
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    
    // Now should show "Disponible"
    expect(screen.getByText('Disponible')).toBeTruthy();
  });
});
