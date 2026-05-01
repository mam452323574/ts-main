import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { CameraGuide, getCameraGuideLayout } from '@/components/CameraGuide';

describe('CameraGuide', () => {
  const screenSize = Dimensions.get('window');
  const expectedBodyOffset = Math.min(40, Math.max(28, Math.round(screenSize.height * 0.045)));

  it('returns null when scanType is null', () => {
    const { toJSON } = render(<CameraGuide scanType={null} />);

    expect(toJSON()).toBeNull();
  });

  it('preserves the frame geometry for each scan type', () => {
    const bodyLayout = getCameraGuideLayout('body', screenSize.width, screenSize.height);
    const nutritionLayout = getCameraGuideLayout('nutrition', screenSize.width, screenSize.height);
    const healthLayout = getCameraGuideLayout('health', screenSize.width, screenSize.height);
    const superLayout = getCameraGuideLayout('super', screenSize.width, screenSize.height);

    expect(bodyLayout.frameWidth).toBe(screenSize.width * 0.7);
    expect(bodyLayout.frameHeight).toBe(screenSize.height * 0.45);
    expect(bodyLayout.frameOffsetY).toBe(-expectedBodyOffset);

    expect(nutritionLayout.frameWidth).toBe(screenSize.width * 0.7);
    expect(nutritionLayout.frameHeight).toBe(screenSize.width * 0.7);
    expect(healthLayout.frameWidth).toBe(screenSize.width * 0.5);
    expect(superLayout.frameHeight).toBe(screenSize.height * 0.35);
  });

  it('renders only four white framing corners for visible scan types', () => {
    render(<CameraGuide scanType="nutrition" visible />);

    const frameStyle = StyleSheet.flatten(screen.getByTestId('camera-guide-frame').props.style);
    const topLeftCornerStyle = StyleSheet.flatten(screen.getByTestId('camera-guide-frame-corner-top-left').props.style);
    const topRightCornerStyle = StyleSheet.flatten(screen.getByTestId('camera-guide-frame-corner-top-right').props.style);
    const bottomLeftCornerStyle = StyleSheet.flatten(screen.getByTestId('camera-guide-frame-corner-bottom-left').props.style);
    const bottomRightCornerStyle = StyleSheet.flatten(screen.getByTestId('camera-guide-frame-corner-bottom-right').props.style);

    expect(frameStyle.width).toBe(screenSize.width * 0.7);
    expect(frameStyle.height).toBe(screenSize.width * 0.7);
    expect(frameStyle.borderRadius).toBeUndefined();
    expect(frameStyle.overflow).toBeUndefined();
    expect(frameStyle.borderWidth).toBeUndefined();
    expect(frameStyle.backgroundColor).toBeUndefined();
    expect(topLeftCornerStyle.borderTopWidth).toBeGreaterThan(0);
    expect(topLeftCornerStyle.borderLeftWidth).toBeGreaterThan(0);
    expect(topLeftCornerStyle.borderColor).toBe('#FFFFFF');
    expect(topRightCornerStyle.borderTopWidth).toBeGreaterThan(0);
    expect(topRightCornerStyle.borderRightWidth).toBeGreaterThan(0);
    expect(topRightCornerStyle.borderColor).toBe('#FFFFFF');
    expect(bottomLeftCornerStyle.borderBottomWidth).toBeGreaterThan(0);
    expect(bottomLeftCornerStyle.borderLeftWidth).toBeGreaterThan(0);
    expect(bottomLeftCornerStyle.borderColor).toBe('#FFFFFF');
    expect(bottomRightCornerStyle.borderBottomWidth).toBeGreaterThan(0);
    expect(bottomRightCornerStyle.borderRightWidth).toBeGreaterThan(0);
    expect(bottomRightCornerStyle.borderColor).toBe('#FFFFFF');
    expect(screen.queryByTestId('camera-guide-reticle')).toBeNull();
    expect(screen.queryByTestId('camera-guide-halo')).toBeNull();
    expect(screen.queryByTestId('camera-guide-bubble')).toBeNull();
  });
});
