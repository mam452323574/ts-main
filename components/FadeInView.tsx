import { ReactNode } from 'react';
import { View } from 'react-native';

interface FadeInViewProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: any;
}

// Version simplifiée sans animation (Reanimated désactivé temporairement)
export function FadeInView({ children, style }: FadeInViewProps) {
  return <View style={style}>{children}</View>;
}
