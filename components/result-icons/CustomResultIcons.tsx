import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

export interface CustomResultIconProps {
  color: string;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}

function BaseResultIcon({
  children,
  size = 24,
  testID,
}: React.PropsWithChildren<Pick<CustomResultIconProps, 'size' | 'testID'>>) {
  return (
    <Svg
      fill="none"
      height={size}
      testID={testID}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </Svg>
  );
}

export function FaceContourIcon({
  color,
  size = 24,
  strokeWidth = 1.9,
  testID,
}: CustomResultIconProps) {
  return (
    <BaseResultIcon size={size} testID={testID}>
      <Path
        d="M12 4.25c-2.9 0-4.85 2.42-4.85 5.86v1.45c0 3.43 1.9 6.32 4.85 8.19 2.95-1.87 4.85-4.76 4.85-8.19v-1.45c0-3.44-1.95-5.86-4.85-5.86Z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="M9.45 11.55c.6.55 1.48.87 2.55.87 1.07 0 1.95-.32 2.55-.87"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="M10.05 15.55c.5.4 1.18.62 1.95.62.77 0 1.45-.22 1.95-.62"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </BaseResultIcon>
  );
}

export function MuscleMassIcon({
  color,
  size = 24,
  strokeWidth = 1.9,
  testID,
}: CustomResultIconProps) {
  return (
    <BaseResultIcon size={size} testID={testID}>
      <Path
        d="M7.5 16.75c0-1.88 1.08-3.54 2.72-4.33l1.48-.72 1.48 1.48c.66.66 1.56 1.03 2.49 1.03h.83"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="M10.35 9.1 11.2 6.7c.16-.46.6-.77 1.09-.77h1.06c.68 0 1.24.55 1.24 1.23v1.17"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="M8.15 17.45h4.75c2.45 0 4.45-1.98 4.45-4.42v-.68"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <Line
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        x1="6.25"
        x2="8.35"
        y1="17.45"
        y2="17.45"
      />
    </BaseResultIcon>
  );
}

export function PostureAlignmentIcon({
  color,
  size = 24,
  strokeWidth = 1.9,
  testID,
}: CustomResultIconProps) {
  return (
    <BaseResultIcon size={size} testID={testID}>
      <Line
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        x1="6"
        x2="6"
        y1="5"
        y2="19"
      />
      <Line
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        x1="18"
        x2="18"
        y1="5"
        y2="19"
      />
      <Circle
        cx="12"
        cy="7"
        r="2.1"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M12 9.3v5.9"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="M9.35 11.25h5.3"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      <Path
        d="m10.15 19 1.85-3.8L13.85 19"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </BaseResultIcon>
  );
}
