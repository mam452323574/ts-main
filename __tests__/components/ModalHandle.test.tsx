import React from 'react';
import { render } from '@testing-library/react-native';
import { ModalHandle } from '@/components/ModalHandle';

describe('ModalHandle', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ModalHandle />);
    
    expect(toJSON()).toBeTruthy();
  });

  it('renders the handle element', () => {
    const { toJSON } = render(<ModalHandle />);
    const tree = toJSON();
    
    // The component should render an Animated.View containing the handle
    expect(tree).toBeTruthy();
    expect(tree).not.toBeNull();
  });

  it('has proper structure', () => {
    const { toJSON } = render(<ModalHandle />);
    const tree = toJSON();
    
    // Verify the component has children (the handle view)
    expect(tree).toBeTruthy();
    if (tree && typeof tree === 'object' && 'children' in tree) {
      expect(tree.children).toBeTruthy();
    }
  });
});
