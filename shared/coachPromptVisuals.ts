import {
  Activity,
  Apple,
  CalendarDays,
  Droplets,
  Dumbbell,
  LineChart,
  MessageCircle,
  Moon,
  RefreshCw,
  ScanFace,
  ScanSearch,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react-native';
import type { ImageSourcePropType } from 'react-native';

import {
  getVisualMoodGradient,
  getVisualMoodSurface,
  mixColors,
  type ThemeColors,
  withAlpha,
} from '@/constants/theme';
import type { CoachImageCrop } from '@/shared/coachImageCrop';

import type {
  CoachGenerationPromptType,
  CoachPromptType,
} from './coachPromptTypes';

export interface CoachPromptVisual {
  icon: LucideIcon;
  accentColor: string;
  artworkSource: ImageSourcePropType;
  /**
   * Per-prompt cropping. Most prompt artworks have the subject centred but
   * occupy only ~40–45% of the 768×768 source, so a small `imageScale` bump
   * gives them more visual presence inside the artwork frame. A handful of
   * prompts have a slightly off-centre subject (loupe, kettlebell) and use
   * a small downscale or shifted position instead.
   */
  crop?: CoachImageCrop;
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

export const COACH_PROMPT_VISUALS: Record<CoachGenerationPromptType, CoachPromptVisual> = {
  free_question: {
    icon: MessageCircle,
    accentColor: '#88A978',
    artworkSource: require('../assets/images/coach/prompts/latest_scan.webp'),
    crop: { imageScale: 1.1 },
  },
  latest_scan: {
    icon: ScanSearch,
    accentColor: '#7FA9D4',
    artworkSource: require('../assets/images/coach/prompts/latest_scan.webp'),
    crop: { imageScale: 1.1 },
  },
  latest_scan_issue_resolution: {
    icon: ScanSearch,
    accentColor: '#7FA9D4',
    artworkSource: require('../assets/images/coach/prompts/latest_scan.webp'),
    crop: { imageScale: 1.1 },
  },
  weekly_plan: {
    icon: CalendarDays,
    accentColor: '#C99A64',
    artworkSource: require('../assets/images/coach/prompts/weekly_plan.webp'),
    crop: { imageScale: 1.1 },
  },
  recovery_plan: {
    icon: RefreshCw,
    accentColor: '#A99BCF',
    artworkSource: require('../assets/images/coach/prompts/recovery_plan.webp'),
    crop: { imageScale: 1.1 },
  },
  nutrition_focus: {
    icon: Apple,
    accentColor: '#72AFA8',
    artworkSource: require('../assets/images/coach/prompts/nutrition_focus.webp'),
    crop: { imageScale: 1.1 },
  },
  body_focus: {
    icon: Dumbbell,
    accentColor: '#8D9EC8',
    artworkSource: require('../assets/images/coach/prompts/body_focus.webp'),
    // Sujet (haltère) placé en diagonale et décalé bas-droite dans l'asset :
    //   un imageScale > 1 pousse une des extrémités hors-frame. On garde 1.0
    //   pour conserver l'haltère entier après le crop `contentFit="cover"`.
    crop: { imageScale: 1.0 },
  },
  face_focus: {
    icon: ScanFace,
    accentColor: '#D98B86',
    artworkSource: require('../assets/images/coach/prompts/face_focus.webp'),
    crop: { imageScale: 1.1 },
  },
  hydration_focus: {
    icon: Droplets,
    accentColor: '#78AAC8',
    artworkSource: require('../assets/images/coach/prompts/hydration_focus.webp'),
    crop: { imageScale: 1.15 },
  },
  sleep_coach: {
    icon: Moon,
    accentColor: '#8C98BD',
    artworkSource: require('../assets/images/coach/prompts/sleep_coach.webp'),
    crop: { imageScale: 1.1 },
  },
  risk_watch: {
    icon: ShieldAlert,
    accentColor: '#C48667',
    artworkSource: require('../assets/images/coach/prompts/risk_watch.webp'),
    crop: { imageScale: 0.95 },
  },
  trend_review: {
    icon: LineChart,
    accentColor: '#7FA9D4',
    artworkSource: require('../assets/images/coach/prompts/trend_review.webp'),
    crop: { imageScale: 1.1 },
  },
};

export function getCoachPromptVisual(
  promptType: CoachGenerationPromptType | CoachPromptType,
): CoachPromptVisual {
  return COACH_PROMPT_VISUALS[promptType] ?? {
    icon: Activity,
    accentColor: '#94A3B8',
    artworkSource: require('../assets/images/coach/prompts/latest_scan.webp'),
  };
}

export function getCoachPromptPalette(
  promptType: CoachGenerationPromptType | CoachPromptType,
  colors: ThemeColors,
  isDark: boolean,
): CoachPromptPalette {
  const { accentColor } = getCoachPromptVisual(promptType);
  const neutralSurface = colors.surfaceMuted ?? colors.cardBackground;
  const neutralBorder = colors.borderSubtle ?? colors.lightGray ?? '#E3E7EF';
  const strongBorder = colors.borderStrong ?? neutralBorder;
  const idleSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'obsidian',
    accentColor,
    intensity: 'card',
    shadow: false,
  });
  const selectedSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'premium',
    accentColor,
    intensity: 'card',
    shadow: false,
  });
  const pressedSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'premium',
    accentColor,
    intensity: 'hero',
    shadow: false,
  });
  const idleGradient = getVisualMoodGradient(
    colors,
    isDark,
    'obsidian',
    accentColor,
  );
  const selectedGradient = getVisualMoodGradient(
    colors,
    isDark,
    'premium',
    accentColor,
  );

  if (isDark) {
    return {
      accentColor,
      accentStrong: mixColors(colors.white, accentColor, 0.18),
      selectorBackgroundColor: mixColors(
        idleSurface.backgroundColor,
        colors.cardBackground,
        0.08,
      ),
      selectorSelectedBackgroundColor: mixColors(
        selectedSurface.backgroundColor,
        colors.cardBackground,
        0.04,
      ),
      selectorPressedBackgroundColor: mixColors(
        pressedSurface.backgroundColor,
        colors.cardBackground,
        0.02,
      ),
      selectorBorderColor: idleSurface.borderColor,
      selectorSelectedBorderColor: selectedSurface.borderColor,
      selectorPressedBorderColor: pressedSurface.borderColor,
      selectorIconBackgroundColor: withAlpha(colors.background, 0.58),
      selectorSelectedIconBackgroundColor: mixColors(colors.background, accentColor, 0.14),
      selectorIconColor: mixColors(colors.white, accentColor, 0.18),
      selectorSelectedBadgeColor: accentColor,
      selectorSelectedBadgeBorderColor: withAlpha(colors.cardBackground, 0.82),
      selectorBackdropColors: [
        withAlpha(idleGradient[0], 0.78),
        withAlpha(idleGradient[1], 0.12),
      ],
      selectorSelectedBackdropColors: [
        withAlpha(selectedGradient[0], 0.62),
        withAlpha(selectedGradient[1], 0.1),
      ],
    };
  }

  const accentStrong = mixColors(accentColor, colors.primaryText, 0.48);

  return {
    accentColor,
    accentStrong,
    selectorBackgroundColor: mixColors(
      idleSurface.backgroundColor,
      colors.cardBackground,
      0.24,
    ),
    selectorSelectedBackgroundColor: mixColors(
      selectedSurface.backgroundColor,
      colors.cardBackground,
      0.2,
    ),
    selectorPressedBackgroundColor: mixColors(
      pressedSurface.backgroundColor,
      colors.cardBackground,
      0.16,
    ),
    selectorBorderColor: mixColors(idleSurface.borderColor, neutralBorder, 0.34),
    selectorSelectedBorderColor: mixColors(selectedSurface.borderColor, strongBorder, 0.22),
    selectorPressedBorderColor: mixColors(pressedSurface.borderColor, strongBorder, 0.18),
    selectorIconBackgroundColor: mixColors(colors.cardBackground, accentStrong, 0.075),
    selectorSelectedIconBackgroundColor: mixColors(
      colors.cardBackground,
      accentStrong,
      0.1,
    ),
    selectorIconColor: accentStrong,
    selectorSelectedBadgeColor: accentStrong,
    selectorSelectedBadgeBorderColor: withAlpha(colors.cardBackground, 0.92),
    selectorBackdropColors: [
      withAlpha(idleGradient[0], 0.2),
      withAlpha(idleGradient[1], 0.05),
    ],
    selectorSelectedBackdropColors: [
      withAlpha(selectedGradient[0], 0.28),
      withAlpha(selectedGradient[1], 0.065),
    ],
  };
}
