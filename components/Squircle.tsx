import React, { forwardRef, useMemo } from 'react';
import {
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { flattenViewStyle } from '@/hooks/useSquircleStyle';

export { SquirclePressable, type SquirclePressableProps } from '@/components/SquirclePressable';

export interface SquircleProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Drop-in replacement for <View> that renders with G2 continuous corners on iOS
 * via the native `borderCurve: 'continuous'` prop (Apple's squircle / superellipse).
 *
 * On Android and Web, `borderCurve` is a no-op — the View keeps its classical
 * rounded corners. This is an accepted compromise: those platforms do not support
 * native G2 corners, and overlaying SVG paths to fake it creates clipping and
 * shadow artefacts that are worse than the classical look.
 *
 * All original style props (backgroundColor, borderColor, borderWidth,
 * borderRadius, shadow*, padding, etc.) are preserved verbatim on the underlying
 * View, so existing layout, theming, and tests continue to work unchanged.
 */
export const Squircle = forwardRef<View, SquircleProps>(function Squircle(
  { children, style, ...rest },
  ref,
) {
  const flat = useMemo(() => flattenViewStyle(style), [style]);
  const hasRadius = useMemo(() => stylesHaveRadius(flat), [flat]);

  const composedStyle = useMemo<StyleProp<ViewStyle>>(() => {
    if (!hasRadius) return style;
    if (Array.isArray(style)) {
      return [...style, continuousCurveStyle];
    }
    return [style, continuousCurveStyle];
  }, [hasRadius, style]);

  return (
    <View ref={ref} style={composedStyle} {...rest}>
      {children}
    </View>
  );
});

function stylesHaveRadius(flat: ViewStyle): boolean {
  return (
    typeof flat.borderRadius === 'number' ||
    typeof flat.borderTopLeftRadius === 'number' ||
    typeof flat.borderTopRightRadius === 'number' ||
    typeof flat.borderBottomLeftRadius === 'number' ||
    typeof flat.borderBottomRightRadius === 'number'
  );
}

// React Native 0.71+ on iOS: maps to CALayer.cornerCurve = .continuous (Apple G2 squircle).
// Ignored on Android and Web — silent no-op.
const continuousCurveStyle: ViewStyle = {
  borderCurve: 'continuous',
};
