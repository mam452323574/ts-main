import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FadeInView } from '@/components/FadeInView';

describe('FadeInView', () => {
  it('renders children correctly', () => {
    render(
      <FadeInView>
        <Text>Test Content</Text>
      </FadeInView>
    );
    
    expect(screen.getByText('Test Content')).toBeTruthy();
  });

  it('renders multiple children', () => {
    render(
      <FadeInView>
        <Text>First</Text>
        <Text>Second</Text>
      </FadeInView>
    );
    
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('renders with custom delay', () => {
    const { toJSON } = render(
      <FadeInView delay={500}>
        <Text>Delayed Content</Text>
      </FadeInView>
    );
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Delayed Content')).toBeTruthy();
  });

  it('renders with custom duration', () => {
    const { toJSON } = render(
      <FadeInView duration={1000}>
        <Text>Custom Duration</Text>
      </FadeInView>
    );
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Custom Duration')).toBeTruthy();
  });

  it('renders with custom style', () => {
    const customStyle = { backgroundColor: 'red' };
    
    const { toJSON } = render(
      <FadeInView style={customStyle}>
        <Text>Styled Content</Text>
      </FadeInView>
    );
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Styled Content')).toBeTruthy();
  });

  it('renders nested components', () => {
    render(
      <FadeInView>
        <View>
          <Text>Nested Text</Text>
        </View>
      </FadeInView>
    );
    
    expect(screen.getByText('Nested Text')).toBeTruthy();
  });
});
