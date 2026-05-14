import React from 'react';
import { View } from 'react-native';
import {
  Activity,
  Camera,
  Circle,
  CircleDot,
  CircleGauge,
  CirclePercent,
  ClipboardCheck,
  Clock3,
  Droplet,
  Droplets,
  Dumbbell,
  Egg,
  Eye,
  Flame,
  Gauge,
  HeartPulse,
  LeafyGreen,
  MoonStar,
  Orbit,
  PersonStanding,
  PillBottle,
  Ruler,
  Salad,
  Scale,
  ScanFace,
  ShieldCheck,
  ShieldQuestionMark,
  Sparkle,
  SunMedium,
  ThermometerSun,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react-native';
import {
  FaceContourIcon,
  MuscleMassIcon,
  PostureAlignmentIcon,
} from '@/components/result-icons/CustomResultIcons';
import {
  getResultIconDescriptor,
} from '@/utils/resultIconCatalog';
import type {
  ResultCustomIconName,
  ResultIconToken,
  ResultLucideIconName,
} from '@/utils/resultIconCatalog';

interface ResultIconProps {
  token: ResultIconToken;
  color: string;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}

const CUSTOM_ICON_BY_NAME: Record<ResultCustomIconName, React.ComponentType<any>> = {
  faceContour: FaceContourIcon,
  muscleMass: MuscleMassIcon,
  postureAlignment: PostureAlignmentIcon,
};

const LUCIDE_ICON_BY_NAME: Record<ResultLucideIconName, React.ComponentType<any>> = {
  Camera,
  CircleGauge,
  CirclePercent,
  ClipboardCheck,
  Clock3,
  Droplet,
  Droplets,
  Dumbbell,
  Egg,
  Eye,
  Flame,
  Gauge,
  HeartPulse,
  LeafyGreen,
  MoonStar,
  Orbit,
  PersonStanding,
  PillBottle,
  Ruler,
  Salad,
  Scale,
  CircleDot,
  ScanFace,
  ShieldCheck,
  ShieldQuestionMark,
  Sparkle,
  SunMedium,
  ThermometerSun,
  UtensilsCrossed,
  Wheat,
};

function resolveIconComponent(token: ResultIconToken) {
  const descriptor = getResultIconDescriptor(token);

  if (descriptor.kind === 'custom') {
    return CUSTOM_ICON_BY_NAME[descriptor.name] ?? null;
  }

  return (
    LUCIDE_ICON_BY_NAME[descriptor.name] ??
    Sparkle ??
    Activity ??
    Circle ??
    null
  );
}

export function ResultIcon({
  token,
  color,
  size = 18,
  strokeWidth,
  testID,
}: ResultIconProps) {
  const IconComponent = resolveIconComponent(token);

  if (!IconComponent) {
    return <View style={{ width: size, height: size }} testID={testID} />;
  }

  return (
    <IconComponent
      color={color}
      size={size}
      strokeWidth={strokeWidth}
      testID={testID}
    />
  );
}
