import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DailyStat } from '@/components/DailyStat';

describe('DailyStat', () => {
  it('displays the label correctly', () => {
    render(<DailyStat label="Calories" current={1500} goal={2000} unit="kcal" />);
    
    expect(screen.getByText('Calories')).toBeTruthy();
  });

  it('displays current/goal values with unit', () => {
    render(<DailyStat label="Calories" current={1500} goal={2000} unit="kcal" />);
    
    expect(screen.getByText('1500 / 2000 kcal')).toBeTruthy();
  });

  it('displays different units correctly', () => {
    render(<DailyStat label="Bodyfat" current={18} goal={25} unit="%" />);
    
    expect(screen.getByText('Bodyfat')).toBeTruthy();
    expect(screen.getByText('18 / 25 %')).toBeTruthy();
  });

  it('handles zero values', () => {
    render(<DailyStat label="Steps" current={0} goal={10000} unit="pas" />);
    
    expect(screen.getByText('0 / 10000 pas')).toBeTruthy();
  });

  it('handles values exceeding goal', () => {
    // Component caps percentage at 100%, but still displays actual values
    render(<DailyStat label="Calories" current={2500} goal={2000} unit="kcal" />);
    
    expect(screen.getByText('2500 / 2000 kcal')).toBeTruthy();
  });
});
