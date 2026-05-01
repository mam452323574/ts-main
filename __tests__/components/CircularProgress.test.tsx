import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CircularProgress } from '@/components/CircularProgress';

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: 'Svg',
    Svg: 'Svg',
    Circle: 'Circle',
  };
});

describe('CircularProgress', () => {
  it('displays the value', () => {
    render(<CircularProgress value={75} />);

    expect(screen.getByText('75')).toBeTruthy();
  });



  it('renders with different values', () => {
    const { rerender } = render(<CircularProgress value={0} />);
    expect(screen.getByText('0')).toBeTruthy();

    rerender(<CircularProgress value={100} />);
    expect(screen.getByText('100')).toBeTruthy();

    rerender(<CircularProgress value={42} />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { toJSON } = render(<CircularProgress value={80} size={200} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<CircularProgress value={65} />);
    expect(toJSON()).toBeTruthy();
  });
});
