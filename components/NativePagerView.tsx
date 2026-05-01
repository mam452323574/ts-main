import React, { forwardRef } from 'react';
import PagerView from 'react-native-pager-view';

export const NativePagerView = forwardRef<any, any>((props, ref) => {
  return <PagerView ref={ref} {...props} />;
});

NativePagerView.displayName = 'NativePagerView';
