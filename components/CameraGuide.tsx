import { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { ScanType } from '@/types';

export interface CameraGuideLayout {
  frameWidth: number;
  frameHeight: number;
  frameOffsetY: number;
}

export interface CameraGuideProps {
  scanType: ScanType | null;
  visible?: boolean;
}

const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } = Dimensions.get('window');

const BODY_GUIDE_OFFSET_Y = Math.min(40, Math.max(28, Math.round(DEFAULT_SCREEN_HEIGHT * 0.045)));
const FRAME_CORNER_SIZE = 28;
const FRAME_CORNER_THICKNESS = 1.2;

export function getCameraGuideLayout(
  scanType: ScanType,
  screenWidth = DEFAULT_SCREEN_WIDTH,
  screenHeight = DEFAULT_SCREEN_HEIGHT
): CameraGuideLayout {
  switch (scanType) {
    case 'nutrition':
      return {
        frameWidth: screenWidth * 0.7,
        frameHeight: screenWidth * 0.7,
        frameOffsetY: 0,
      };
    case 'body':
      return {
        frameWidth: screenWidth * 0.7,
        frameHeight: screenHeight * 0.45,
        frameOffsetY: -BODY_GUIDE_OFFSET_Y,
      };
    case 'health':
    case 'super':
    default:
      return {
        frameWidth: screenWidth * 0.5,
        frameHeight: screenHeight * 0.35,
        frameOffsetY: 0,
      };
  }
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

export function CameraGuide({ scanType, visible = true }: CameraGuideProps) {
  const { colors } = useTheme();
  const stylesMemo = useMemo(() => createStyles(), []);
  const layout = useMemo(() => {
    if (!scanType) {
      return null;
    }

    return getCameraGuideLayout(scanType);
  }, [scanType]);

  if (!scanType || !visible || !layout) {
    return null;
  }

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
          color={colors.white}
          cornerSize={FRAME_CORNER_SIZE}
          thickness={FRAME_CORNER_THICKNESS}
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
    },
  });

export default CameraGuide;
