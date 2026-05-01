import {
  Activity,
  Apple,
  CalendarDays,
  Droplets,
  Dumbbell,
  LineChart,
  Moon,
  RefreshCw,
  ScanFace,
  ScanSearch,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react-native';

import {
  mixColors,
  type ThemeColors,
  withAlpha,
} from '@/constants/theme';

import type { CoachPromptType } from './coachPromptTypes';

export interface CoachPromptVisual {
  icon: LucideIcon;
  accentColor: string;
}

export interface CoachPromptPalette {
  accentColor: string;
  accentStrong: string;
  selectorBackgroundColor: string;
  selectorSelectedBackgroundColor: string;
  selectorPressedBackgroundColor: string;
  selectorBorderColor: string;
  selectorSelectedBorderColor: string;
  selectorPressedBorderColor: string;
  selectorIconBackgroundColor: string;
  selectorSelectedIconBackgroundColor: string;
  selectorIconColor: string;
  selectorSelectedBadgeColor: string;
  selectorSelectedBadgeBorderColor: string;
  selectorBackdropColors: readonly [string, string];
  selectorSelectedBackdropColors: readonly [string, string];
}

export const COACH_PROMPT_VISUALS: Record<CoachPromptType, CoachPromptVisual> = {
  latest_scan: {
    icon: ScanSearch,
    accentColor: '#6CA7FF',
  },
  weekly_plan: {
    icon: CalendarDays,
    accentColor: '#FFB85C',
  },
  recovery_plan: {
    icon: RefreshCw,
    accentColor: '#C29EFF',
  },
  nutrition_focus: {
    icon: Apple,
    accentColor: '#53C6BB',
  },
  body_focus: {
    icon: Dumbbell,
    accentColor: '#88A7FF',
  },
  face_focus: {
    icon: ScanFace,
    accentColor: '#FF8F8B',
  },
  hydration_focus: {
    icon: Droplets,
    accentColor: '#5EC2F6',
  },
  sleep_coach: {
    icon: Moon,
    accentColor: '#8B9DDB',
  },
  risk_watch: {
    icon: ShieldAlert,
    accentColor: '#E88A5C',
  },
  trend_review: {
    icon: LineChart,
    accentColor: '#6FD39A',
  },
};

export function getCoachPromptVisual(
  promptType: CoachPromptType,
): CoachPromptVisual {
  return COACH_PROMPT_VISUALS[promptType] ?? {
    icon: Activity,
    accentColor: '#94A3B8',
  };
}

export function getCoachPromptPalette(
  promptType: CoachPromptType,
  colors: ThemeColors,
  isDark: boolean,
): CoachPromptPalette {
  const { accentColor } = getCoachPromptVisual(promptType);
  const neutralSurface = colors.surfaceMuted ?? colors.cardBackground;
  const neutralBorder = colors.borderSubtle ?? colors.lightGray ?? '#E3E7EF';
  const strongBorder = colors.borderStrong ?? neutralBorder;

  if (isDark) {
    return {
      accentColor,
      accentStrong: accentColor,
      selectorBackgroundColor: mixColors(neutralSurface, accentColor, 0.07),
      selectorSelectedBackgroundColor: mixColors(neutralSurface, accentColor, 0.16),
      selectorPressedBackgroundColor: mixColors(neutralSurface, accentColor, 0.16),
      selectorBorderColor: mixColors(neutralBorder, accentColor, 0.14),
      selectorSelectedBorderColor: mixColors(neutralBorder, accentColor, 0.42),
      selectorPressedBorderColor: mixColors(neutralBorder, accentColor, 0.22),
      selectorIconBackgroundColor: mixColors(neutralSurface, accentColor, 0.26),
      selectorSelectedIconBackgroundColor: mixColors(neutralSurface, accentColor, 0.26),
      selectorIconColor: mixColors(colors.white, accentColor, 0.18),
      selectorSelectedBadgeColor: accentColor,
      selectorSelectedBadgeBorderColor: withAlpha(colors.cardBackground, 0.82),
      selectorBackdropColors: [
        withAlpha(accentColor, 0.14),
        withAlpha(accentColor, 0.02),
      ],
      selectorSelectedBackdropColors: [
        withAlpha(accentColor, 0.22),
        withAlpha(accentColor, 0.02),
      ],
    };
  }

  const accentStrong = mixColors(accentColor, colors.primaryText, 0.42);

  return {
    accentColor,
    accentStrong,
    selectorBackgroundColor: mixColors(colors.cardBackground, accentStrong, 0.16),
    selectorSelectedBackgroundColor: mixColors(
      colors.cardBackground,
      accentStrong,
      0.28,
    ),
    selectorPressedBackgroundColor: mixColors(colors.cardBackground, accentStrong, 0.22),
    selectorBorderColor: mixColors(neutralBorder, accentStrong, 0.44),
    selectorSelectedBorderColor: mixColors(strongBorder, accentStrong, 0.62),
    selectorPressedBorderColor: mixColors(strongBorder, accentStrong, 0.54),
    selectorIconBackgroundColor: mixColors(colors.cardBackground, accentStrong, 0.12),
    selectorSelectedIconBackgroundColor: mixColors(
      colors.cardBackground,
      accentStrong,
      0.16,
    ),
    selectorIconColor: accentStrong,
    selectorSelectedBadgeColor: accentStrong,
    selectorSelectedBadgeBorderColor: withAlpha(colors.cardBackground, 0.92),
    selectorBackdropColors: [
      withAlpha(accentStrong, 0.09),
      withAlpha(accentStrong, 0.02),
    ],
    selectorSelectedBackdropColors: [
      withAlpha(accentStrong, 0.14),
      withAlpha(accentStrong, 0.03),
    ],
  };
}
