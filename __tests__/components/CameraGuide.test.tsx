import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { CameraGuide, getCameraGuideLayout } from '@/components/CameraGuide';

const SCAN_TYPES = ['health', 'body', 'nutrition', 'super'] as const;
const CORNER_TEST_IDS = [
  'camera-guide-frame-corner-top-left',
  'camera-guide-frame-corner-top-right',
  'camera-guide-frame-corner-bottom-left',
  'camera-guide-frame-corner-bottom-right',
] as const;
const EXTRA_DETAIL_TEST_IDS = [
  'camera-guide-edge-tick-left',
  'camera-guide-edge-tick-right',
  'camera-guide-premium-detail',
  'camera-guide-reticle',
  'camera-guide-halo',
  'camera-guide-bubble',
  'camera-guide-bubble-text',
] as const;
const EXPECTED_CORNER_SIZES: Record<(typeof SCAN_TYPES)[number], number> = {
  health: 30,
  body: 34,
  nutrition: 36,
  super: 32,
};

function expectNoExtraGuideDetails() {
  EXTRA_DETAIL_TEST_IDS.forEach((testID) => {
    expect(screen.queryByTestId(testID)).toBeNull();
  });
}

describe('CameraGuide', () => {
  const screenSize = Dimensions.get('window');

  it('returns null when scanType is null', () => {
    const { toJSON } = render(<CameraGuide scanType={null} />);

    expect(toJSON()).toBeNull();
  });

  it('preserves distinct frame proportions and simple corner sizes for each scan type', () => {
    const width = 390;
    const height = 844;
    const bodyLayout = getCameraGuideLayout('body', width, height);
    const nutritionLayout = getCameraGuideLayout('nutrition', width, height);
    const healthLayout = getCameraGuideLayout('health', width, height);
    const superLayout = getCameraGuideLayout('super', width, height);

    expect(healthLayout.frameWidth).toBeCloseTo(width * 0.62);
    expect(healthLayout.frameHeight).toBeCloseTo(healthLayout.frameWidth * 1.24);
    expect(healthLayout.shape).toBe('portrait');
    expect(healthLayout.cornerSize).toBe(30);
    expect(healthLayout.cornerThickness).toBe(2);

    expect(bodyLayout.frameWidth).toBeCloseTo(width * 0.68);
    expect(bodyLayout.frameHeight).toBeCloseTo(bodyLayout.frameWidth * 2.08);
    expect(bodyLayout.shape).toBe('portrait');
    expect(bodyLayout.cornerSize).toBe(34);
    expect(bodyLayout.cornerThickness).toBe(2);

    expect(nutritionLayout.frameWidth).toBeCloseTo(width * 0.86);
    expect(nutritionLayout.frameHeight).toBeCloseTo(
      nutritionLayout.frameWidth * 0.58,
    );
    expect(nutritionLayout.shape).toBe('landscape');
    expect(nutritionLayout.cornerSize).toBe(36);
    expect(nutritionLayout.cornerThickness).toBe(2);

    expect(superLayout.frameWidth).toBeCloseTo(width * 0.7);
    expect(superLayout.frameHeight).toBeCloseTo(superLayout.frameWidth * 1.18);
    expect(superLayout.shape).toBe('portrait');
    expect(superLayout.cornerSize).toBe(32);
    expect(superLayout.cornerThickness).toBe(2);
  });

  it.each([
    ['compact iPhone', 375, 667, { top: 40, bottom: 248 }],
    ['standard iPhone', 390, 844, { top: 24, bottom: 264 }],
    ['large iPhone', 430, 932, { top: 56, bottom: 300 }],
  ])('keeps every guide inside the safe viewport on %s', (_label, width, height, viewportInsets) => {
    SCAN_TYPES.forEach((scanType) => {
      const layout = getCameraGuideLayout(scanType, width, height, viewportInsets);

      expect(layout.frameTop).toBeGreaterThanOrEqual(viewportInsets.top + 12);
      expect(layout.frameBottom).toBeLessThanOrEqual(
        height - viewportInsets.bottom - 12,
      );
      expect(layout.frameOffsetY).toBeCloseTo(
        layout.frameTop - (height - layout.frameHeight) / 2,
      );
    });
  });

  it.each(SCAN_TYPES)('renders only four simple corners for %s', (scanType) => {
    render(<CameraGuide scanType={scanType} visible />);

    const layout = getCameraGuideLayout(
      scanType,
      screenSize.width,
      screenSize.height,
    );
    const frameStyle = StyleSheet.flatten(
      screen.getByTestId('camera-guide-frame').props.style,
    );
    const topLeftCornerStyle = StyleSheet.flatten(
      screen.getByTestId('camera-guide-frame-corner-top-left').props.style,
    );
    const topRightCornerStyle = StyleSheet.flatten(
      screen.getByTestId('camera-guide-frame-corner-top-right').props.style,
    );
    const bottomLeftCornerStyle = StyleSheet.flatten(
      screen.getByTestId('camera-guide-frame-corner-bottom-left').props.style,
    );
    const bottomRightCornerStyle = StyleSheet.flatten(
      screen.getByTestId('camera-guide-frame-corner-bottom-right').props.style,
    );

    expect(frameStyle.width).toBe(layout.frameWidth);
    expect(frameStyle.height).toBe(layout.frameHeight);
    expect(frameStyle.borderRadius).toBeUndefined();
    expect(frameStyle.overflow).toBe('visible');
    expect(frameStyle.borderWidth).toBeUndefined();
    expect(frameStyle.backgroundColor).toBeUndefined();

    CORNER_TEST_IDS.forEach((testID) => {
      expect(screen.getByTestId(testID)).toBeTruthy();
    });
    expect(topLeftCornerStyle.width).toBe(layout.cornerSize);
    expect(topLeftCornerStyle.height).toBe(layout.cornerSize);
    expect(topLeftCornerStyle.width).toBe(
      Math.min(
        EXPECTED_CORNER_SIZES[scanType],
        layout.frameWidth / 4,
        layout.frameHeight / 4,
      ),
    );
    expect(topLeftCornerStyle.borderTopWidth).toBe(layout.cornerThickness);
    expect(topLeftCornerStyle.borderLeftWidth).toBe(layout.cornerThickness);
    expect(topLeftCornerStyle.borderColor).toBeDefined();
    expect(topRightCornerStyle.borderTopWidth).toBe(layout.cornerThickness);
    expect(topRightCornerStyle.borderRightWidth).toBe(layout.cornerThickness);
    expect(topRightCornerStyle.borderColor).toBeDefined();
    expect(bottomLeftCornerStyle.borderBottomWidth).toBe(layout.cornerThickness);
    expect(bottomLeftCornerStyle.borderLeftWidth).toBe(layout.cornerThickness);
    expect(bottomLeftCornerStyle.borderColor).toBeDefined();
    expect(bottomRightCornerStyle.borderBottomWidth).toBe(layout.cornerThickness);
    expect(bottomRightCornerStyle.borderRightWidth).toBe(layout.cornerThickness);
    expect(bottomRightCornerStyle.borderColor).toBeDefined();
    expectNoExtraGuideDetails();
  });

  it('keeps the guide free of text bubbles even when hint copy is provided', () => {
    const { rerender } = render(
      <CameraGuide scanType="health" visible status="warning" hint="Center your face" />,
    );

    expectNoExtraGuideDetails();

    rerender(
      <CameraGuide scanType="health" visible status="success" hint="Photo ready" />,
    );

    expectNoExtraGuideDetails();
  });
});
