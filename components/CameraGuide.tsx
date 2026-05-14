import { useMemo } from 'react';
import {
  Dimensions,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { ScanType } from '@/types';

export type CameraGuideStatus =
  | 'idle'
  | 'countdown'
  | 'capturing'
  | 'success'
  | 'warning';

export interface CameraGuideTone {
  accentColor?: string;
  warningColor?: string;
  successColor?: string;
}

export interface CameraGuideViewportInsets {
  top?: number;
  bottom?: number;
}

export interface CameraGuideLayout {
  frameWidth: number;
  frameHeight: number;
  frameOffsetY: number;
  frameTop: number;
  frameBottom: number;
  availableTop: number;
  availableBottom: number;
  cornerSize: number;
  cornerThickness: number;
  shape: 'square' | 'portrait' | 'oval' | 'landscape';
}

export interface CameraGuideProps {
  scanType: ScanType | null;
  visible?: boolean;
  status?: CameraGuideStatus;
  accentColor?: string;
  tone?: CameraGuideTone;
  hint?: string | null;
  viewportInsets?: CameraGuideViewportInsets;
}

const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
  Dimensions.get('window');

interface CameraGuideConfig {
  widthRatio: number;
  heightToWidth: number;
  maxHeightRatio: number;
  centerBias: number;
  cornerSize: number;
  cornerThickness: number;
  shape: CameraGuideLayout['shape'];
}

const CAMERA_GUIDE_EDGE_PADDING = 12;
const CAMERA_GUIDE_HORIZONTAL_PADDING_RATIO = 0.06;
const CAMERA_GUIDE_MIN_HORIZONTAL_PADDING = 20;

const CAMERA_GUIDE_CONFIG: Record<ScanType, CameraGuideConfig> = {
  health: {
    widthRatio: 0.62,
    heightToWidth: 1.24,
    maxHeightRatio: 0.54,
    centerBias: -0.02,
    cornerSize: 30,
    cornerThickness: 2,
    shape: 'portrait',
  },
  body: {
    widthRatio: 0.68,
    heightToWidth: 2.08,
    maxHeightRatio: 0.74,
    centerBias: -0.04,
    cornerSize: 34,
    cornerThickness: 2,
    shape: 'portrait',
  },
  nutrition: {
    widthRatio: 0.86,
    heightToWidth: 0.58,
    maxHeightRatio: 0.36,
    centerBias: 0.02,
    cornerSize: 36,
    cornerThickness: 2,
    shape: 'landscape',
  },
  super: {
    widthRatio: 0.7,
    heightToWidth: 1.18,
    maxHeightRatio: 0.62,
    centerBias: -0.02,
    cornerSize: 32,
    cornerThickness: 2,
    shape: 'portrait',
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeInset = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

export function getCameraGuideLayout(
  scanType: ScanType,
  screenWidth = DEFAULT_SCREEN_WIDTH,
  screenHeight = DEFAULT_SCREEN_HEIGHT,
  viewportInsets: CameraGuideViewportInsets = {},
): CameraGuideLayout {
  const config = CAMERA_GUIDE_CONFIG[scanType];
  const horizontalPadding = Math.max(
    CAMERA_GUIDE_MIN_HORIZONTAL_PADDING,
    screenWidth * CAMERA_GUIDE_HORIZONTAL_PADDING_RATIO,
  );
  const maxSafeTop = Math.max(0, screenHeight - 96);
  const safeTop = Math.min(normalizeInset(viewportInsets.top), maxSafeTop);
  const safeBottomInset = Math.min(
    normalizeInset(viewportInsets.bottom),
    Math.max(0, screenHeight - safeTop - 96),
  );
  const safeBottom = screenHeight - safeBottomInset;
  const availableHeight = Math.max(96, safeBottom - safeTop);
  const maxFrameWidth = Math.max(96, screenWidth - horizontalPadding * 2);
  const frameWidth = Math.min(screenWidth * config.widthRatio, maxFrameWidth);
  const maxFrameHeight = Math.max(
    80,
    availableHeight - CAMERA_GUIDE_EDGE_PADDING * 2,
  );
  const frameHeight = Math.min(
    frameWidth * config.heightToWidth,
    availableHeight * config.maxHeightRatio,
    maxFrameHeight,
  );
  const targetCenterY =
    safeTop + availableHeight * clamp(0.5 + config.centerBias, 0.34, 0.62);
  const unclampedFrameTop = targetCenterY - frameHeight / 2;
  const minFrameTop = safeTop + CAMERA_GUIDE_EDGE_PADDING;
  const maxFrameTop = safeBottom - CAMERA_GUIDE_EDGE_PADDING - frameHeight;
  const frameTop =
    maxFrameTop >= minFrameTop
      ? clamp(unclampedFrameTop, minFrameTop, maxFrameTop)
      : minFrameTop;
  const frameBottom = frameTop + frameHeight;
  const centeredFrameTop = (screenHeight - frameHeight) / 2;
  const frameOffsetY = frameTop - centeredFrameTop;

  return {
    frameWidth,
    frameHeight,
    frameOffsetY,
    frameTop,
    frameBottom,
    availableTop: safeTop,
    availableBottom: safeBottom,
    cornerSize: Math.min(config.cornerSize, frameWidth / 4, frameHeight / 4),
    cornerThickness: config.cornerThickness,
    shape: config.shape,
  };
}

function CameraCorners({
  cornerSize,
  thickness,
  color,
  testIDPrefix,
}: {
  cornerSize: number;
  thickness: number;
  color: string;
  testIDPrefix?: string;
}) {
  return (
    <>
      <View
        testID={testIDPrefix ? `${testIDPrefix}-corner-top-left` : undefined}
        style={[
          styles.corner,
          {
            width: cornerSize,
            height: cornerSize,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            top: 0,
            left: 0,
          },
        ]}
      />
      <View
        testID={testIDPrefix ? `${testIDPrefix}-corner-top-right` : undefined}
        style={[
          styles.corner,
          {
            width: cornerSize,
            height: cornerSize,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            top: 0,
            right: 0,
          },
        ]}
      />
      <View
        testID={testIDPrefix ? `${testIDPrefix}-corner-bottom-left` : undefined}
        style={[
          styles.corner,
          {
            width: cornerSize,
            height: cornerSize,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            bottom: 0,
            left: 0,
          },
        ]}
      />
      <View
        testID={testIDPrefix ? `${testIDPrefix}-corner-bottom-right` : undefined}
        style={[
          styles.corner,
          {
            width: cornerSize,
            height: cornerSize,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            bottom: 0,
            right: 0,
          },
        ]}
      />
    </>
  );
}

export function CameraGuide({
  scanType,
  visible = true,
  status = 'idle',
  accentColor,
  tone,
  viewportInsets,
}: CameraGuideProps) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const stylesMemo = useMemo(() => createStyles(), []);
  const layout = useMemo(() => {
    if (!scanType) {
      return null;
    }

    return getCameraGuideLayout(scanType, width, height, viewportInsets);
  }, [height, scanType, viewportInsets, width]);
  const guideTone = useMemo(
    () => ({
      accentColor: tone?.accentColor ?? accentColor ?? colors.white,
      warningColor: tone?.warningColor ?? '#F39C6B',
      successColor: tone?.successColor ?? '#8FDCC0',
    }),
    [accentColor, colors.white, tone],
  );

  if (!scanType || !visible || !layout) {
    return null;
  }

  const activeStrokeColor =
    status === 'warning'
      ? guideTone.warningColor
      : status === 'success'
      ? guideTone.successColor
      : guideTone.accentColor;

  return (
    <View pointerEvents="none" style={stylesMemo.root}>
      <View
        testID="camera-guide-frame"
        style={[
          stylesMemo.frame,
          {
            width: layout.frameWidth,
            height: layout.frameHeight,
            transform: [{ translateY: layout.frameOffsetY }],
          },
        ]}
      >
        <CameraCorners
          color={activeStrokeColor}
          cornerSize={layout.cornerSize}
          thickness={layout.cornerThickness}
          testIDPrefix="camera-guide-frame"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
  },
});

const createStyles = () =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    frame: {
      position: 'absolute',
      overflow: 'visible',
    },
  });

export default CameraGuide;
