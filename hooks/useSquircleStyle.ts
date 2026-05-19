import { useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { SQUIRCLE_PILL_THRESHOLD } from '@/constants/theme';
import type { NormalizedCorners } from '@/utils/squirclePath';

export interface SquircleStyleSplit {
  hasRadius: boolean;
  isPill: boolean;
  uniformRadius?: number;
  corners: NormalizedCorners;
  visual: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth: number;
    opacity?: number;
  };
  outerStyle: ViewStyle;
  contentStyle: ViewStyle;
  passThroughStyle: ViewStyle;
}

const OUTER_KEYS = new Set<keyof ViewStyle>([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'start',
  'end',
  'zIndex',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'transform',
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'elevation',
  'aspectRatio',
  'display',
  'pointerEvents',
]);

const STRIPPED_FROM_CONTENT = new Set<keyof ViewStyle>([
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
]);

function pickCorners(flat: ViewStyle): {
  hasRadius: boolean;
  uniformRadius?: number;
  corners: NormalizedCorners;
} {
  const uniform =
    typeof flat.borderRadius === 'number' ? (flat.borderRadius as number) : undefined;
  const tl =
    typeof flat.borderTopLeftRadius === 'number'
      ? (flat.borderTopLeftRadius as number)
      : uniform;
  const tr =
    typeof flat.borderTopRightRadius === 'number'
      ? (flat.borderTopRightRadius as number)
      : uniform;
  const bl =
    typeof flat.borderBottomLeftRadius === 'number'
      ? (flat.borderBottomLeftRadius as number)
      : uniform;
  const br =
    typeof flat.borderBottomRightRadius === 'number'
      ? (flat.borderBottomRightRadius as number)
      : uniform;

  const hasRadius =
    uniform !== undefined ||
    tl !== undefined ||
    tr !== undefined ||
    bl !== undefined ||
    br !== undefined;

  return {
    hasRadius,
    uniformRadius: uniform,
    corners: {
      topLeft: tl ?? 0,
      topRight: tr ?? 0,
      bottomLeft: bl ?? 0,
      bottomRight: br ?? 0,
    },
  };
}

function splitStyle(flat: ViewStyle): {
  outerStyle: ViewStyle;
  contentStyle: ViewStyle;
} {
  const outer: ViewStyle = {};
  const content: ViewStyle = {};

  for (const rawKey of Object.keys(flat)) {
    const key = rawKey as keyof ViewStyle;
    const value = (flat as Record<string, unknown>)[rawKey];
    if (value === undefined) continue;
    if (STRIPPED_FROM_CONTENT.has(key)) continue;
    if (OUTER_KEYS.has(key)) {
      (outer as Record<string, unknown>)[rawKey] = value;
    } else {
      (content as Record<string, unknown>)[rawKey] = value;
    }
  }

  return { outerStyle: outer, contentStyle: content };
}

export function flattenViewStyle(style: StyleProp<ViewStyle>): ViewStyle {
  return (StyleSheet.flatten(style) ?? {}) as ViewStyle;
}

export function useSquircleStyle(style: StyleProp<ViewStyle>): SquircleStyleSplit {
  return useMemo(() => {
    const flat = flattenViewStyle(style);
    const { hasRadius, uniformRadius, corners } = pickCorners(flat);

    const maxRadius = Math.max(
      corners.topLeft,
      corners.topRight,
      corners.bottomLeft,
      corners.bottomRight,
    );
    const isPill = hasRadius && maxRadius >= SQUIRCLE_PILL_THRESHOLD;

    const borderWidth =
      typeof flat.borderWidth === 'number' ? (flat.borderWidth as number) : 0;

    const { outerStyle, contentStyle } = splitStyle(flat);

    return {
      hasRadius,
      isPill,
      uniformRadius,
      corners,
      visual: {
        backgroundColor: flat.backgroundColor as string | undefined,
        borderColor: flat.borderColor as string | undefined,
        borderWidth,
        opacity: typeof flat.opacity === 'number' ? (flat.opacity as number) : undefined,
      },
      outerStyle,
      contentStyle,
      passThroughStyle: flat,
    };
  }, [style]);
}
