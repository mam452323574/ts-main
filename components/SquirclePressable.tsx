import React, { forwardRef, useMemo } from 'react';
import {
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { flattenViewStyle } from '@/hooks/useSquircleStyle';

type StyleResolvable =
  | StyleProp<ViewStyle>
  | ((state: { pressed: boolean; hovered?: boolean; focused?: boolean }) => StyleProp<ViewStyle>);

export interface SquirclePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleResolvable;
}

const continuousCurveStyle: ViewStyle = {
  borderCurve: 'continuous',
};

function stylesHaveRadius(flat: ViewStyle): boolean {
  return (
    typeof flat.borderRadius === 'number' ||
    typeof flat.borderTopLeftRadius === 'number' ||
    typeof flat.borderTopRightRadius === 'number' ||
    typeof flat.borderBottomLeftRadius === 'number' ||
    typeof flat.borderBottomRightRadius === 'number'
  );
}

/**
 * Pressable variant of <Squircle>. Same drop-in semantics: preserves all
 * style props, additionally applies `borderCurve: 'continuous'` so iOS renders
 * G2 corners natively.
 */
export const SquirclePressable = forwardRef<View, SquirclePressableProps>(
  function SquirclePressable({ children, style, ...rest }, ref) {
    const resolvedStyle = useMemo<StyleResolvable | undefined>(() => {
      if (!style) return style;
      if (typeof style === 'function') {
        const styleFn = style;
        return (state) => {
          const inner = styleFn(state);
          const flat = flattenViewStyle(inner);
          if (!stylesHaveRadius(flat)) return inner;
          return Array.isArray(inner)
            ? ([...inner, continuousCurveStyle] as StyleProp<ViewStyle>)
            : ([inner, continuousCurveStyle] as StyleProp<ViewStyle>);
        };
      }
      const flat = flattenViewStyle(style);
      if (!stylesHaveRadius(flat)) return style;
      return Array.isArray(style)
        ? ([...style, continuousCurveStyle] as StyleProp<ViewStyle>)
        : ([style, continuousCurveStyle] as StyleProp<ViewStyle>);
    }, [style]);

    return (
      <Pressable ref={ref} style={resolvedStyle} {...rest}>
        {children as any}
      </Pressable>
    );
  },
);
