import React from 'react';
import { View } from 'react-native';
import * as LucideIcons from 'lucide-react-native';
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

function resolveIconComponent(token: ResultIconToken) {
  const descriptor = getResultIconDescriptor(token);

  if (descriptor.kind === 'custom') {
    return CUSTOM_ICON_BY_NAME[descriptor.name] ?? null;
  }

  const iconSet = LucideIcons as unknown as Record<string, React.ComponentType<any> | undefined>;

  return (
    iconSet[descriptor.name] ??
    iconSet.Sparkle ??
    iconSet.Sparkles ??
    iconSet.Activity ??
    iconSet.Circle ??
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
