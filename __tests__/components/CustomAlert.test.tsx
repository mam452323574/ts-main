import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { CustomAlert } from '@/components/CustomAlert';

describe('CustomAlert', () => {
  it('renders premium variant with emoji and icon area', () => {
    const { getByText, getByTestId } = render(
      <CustomAlert
        visible={true}
        title="Premium required"
        message="Unlock premium features"
        variant="premium"
        onDismiss={jest.fn()}
      />
    );

    expect(getByText('Premium required')).toBeTruthy();
    expect(getByText('Unlock premium features')).toBeTruthy();
    expect(getByTestId('custom-alert-emoji').props.children).toBe('✨');
  });

  it('renders custom emoji and custom icon', () => {
    const { getByText, getByTestId } = render(
      <CustomAlert
        visible={true}
        title="Heads up"
        message="A gentle message"
        emoji="🫶"
        icon={<Text>CustomIcon</Text>}
        onDismiss={jest.fn()}
      />
    );

    expect(getByText('CustomIcon')).toBeTruthy();
    expect(getByTestId('custom-alert-emoji').props.children).toBe('🫶');
  });

  it('suppresses the decorative emoji when emoji is null', () => {
    const { queryByTestId } = render(
      <CustomAlert
        visible={true}
        title="Premium required"
        icon={<Text>CustomIcon</Text>}
        emoji={null}
        onDismiss={jest.fn()}
      />
    );

    expect(queryByTestId('custom-alert-emoji')).toBeNull();
  });

  it('dismisses when overlay is pressed if dismissible', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <CustomAlert visible={true} title="Test" dismissible={true} onDismiss={onDismiss} />
    );

    fireEvent.press(getByTestId('custom-alert-overlay'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('does not dismiss on overlay when dismissible is false', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <CustomAlert visible={true} title="Test" dismissible={false} onDismiss={onDismiss} />
    );

    fireEvent.press(getByTestId('custom-alert-overlay'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('executes button handlers in order', () => {
    const onDismiss = jest.fn();
    const onConfirm = jest.fn();

    const { getAllByText } = render(
      <CustomAlert
        visible={true}
        title="Confirm"
        buttons={[
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'default', onPress: onConfirm },
        ]}
        onDismiss={onDismiss}
      />
    );

    fireEvent.press(getAllByText('Confirm')[1]);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
