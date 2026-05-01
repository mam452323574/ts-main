import { ChefHat, Dumbbell, Leaf } from 'lucide-react-native';

import type { FridgeMealMode } from '@/types/fridgeScan';

type ChefModeIconProps = {
  mode: FridgeMealMode;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export function ChefModeIcon({
  mode,
  color,
  size = 16,
  strokeWidth = 2.4,
}: ChefModeIconProps) {
  if (mode === 'muscle_gain') {
    return <Dumbbell color={color} size={size} strokeWidth={strokeWidth} />;
  }

  if (mode === 'gourmand') {
    return <ChefHat color={color} size={size} strokeWidth={strokeWidth} />;
  }

  return <Leaf color={color} size={size} strokeWidth={strokeWidth} />;
}
