import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingSpinner } from '@/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LoadingSpinner />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays an ActivityIndicator', () => {
    const { UNSAFE_getByType } = render(<LoadingSpinner />);
    const { ActivityIndicator } = require('react-native');
    
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
