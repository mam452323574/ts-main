import React, { forwardRef } from 'react';
import { View } from 'react-native';

export const NativePagerView = forwardRef<any, any>((props, ref) => {
  return <View ref={ref} {...props} />;
});

NativePagerView.displayName = 'NativePagerView';
