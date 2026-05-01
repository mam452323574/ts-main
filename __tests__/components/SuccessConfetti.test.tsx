import React from 'react';
import { render, act } from '@testing-library/react-native';
import { SuccessConfetti } from '@/components/SuccessConfetti';

// Mock react-native-confetti-cannon
jest.mock('react-native-confetti-cannon', () => {
  const React = require('react');
  return React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      start: jest.fn(),
    }));
    return null;
  });
});

describe('SuccessConfetti', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when not active', () => {
    const { toJSON } = render(<SuccessConfetti active={false} />);
    
    expect(toJSON()).toBeNull();
  });

  it('renders when active', () => {
    const { toJSON } = render(<SuccessConfetti active={true} />);
    
    expect(toJSON()).toBeTruthy();
  });

  it('calls onAnimationEnd after animation completes', async () => {
    const mockOnAnimationEnd = jest.fn();
    
    render(
      <SuccessConfetti active={true} onAnimationEnd={mockOnAnimationEnd} />
    );
    
    // Fast-forward time past the animation duration (3 seconds)
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    
    expect(mockOnAnimationEnd).toHaveBeenCalled();
  });

  it('does not call onAnimationEnd when not active', async () => {
    const mockOnAnimationEnd = jest.fn();
    
    render(
      <SuccessConfetti active={false} onAnimationEnd={mockOnAnimationEnd} />
    );
    
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    
    expect(mockOnAnimationEnd).not.toHaveBeenCalled();
  });

  it('cleans up timeout on unmount', () => {
    const mockOnAnimationEnd = jest.fn();
    
    const { unmount } = render(
      <SuccessConfetti active={true} onAnimationEnd={mockOnAnimationEnd} />
    );
    
    // Unmount before animation completes
    unmount();
    
    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    
    // onAnimationEnd should not be called since component unmounted
    expect(mockOnAnimationEnd).not.toHaveBeenCalled();
  });
});
