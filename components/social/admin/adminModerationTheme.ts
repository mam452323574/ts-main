import {
  type ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type {
  AdminActionTone,
  AdminModerationSortMode,
} from '@/components/social/admin/adminModerationUtils';
import type {
  SocialAdminModerationFilter,
  SocialAdminModerationItem,
} from '@/types';

const OBSIDIAN_BASE = '#0B0F14';
const OBSIDIAN_DEEP = '#11161D';
const OBSIDIAN_RAISED = '#151C25';
const OBSIDIAN_PANEL = '#18202B';
const OBSIDIAN_GLOSS = '#1D2733';
const IVORY = '#F4F1EA';
const FOG = '#B8C3CF';
const MUTED = '#7F91A3';
const TRUST_BLUE = '#6FC5FF';
const AMBER = '#F1B369';
const CORAL = '#F47A61';
const ROSE = '#FF6B68';
const MINT = '#76C9A6';
const SLATE = '#223040';

type AccentTone = {
  accent: string;
  accentSoft: string;
  accentSurface: string;
  accentBorder: string;
  accentHalo: string;
  actionFill: string;
  actionText: string;
};

export interface AdminChromePalette {
  screenBackground: string;
  screenBackgroundDeep: string;
  screenBackgroundRaised: string;
  screenOverlay: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  surfaceGlass: string;
  surfaceStrong: string;
  borderSubtle: string;
  borderStrong: string;
  headerSurface: string;
  headerBorder: string;
  headerButtonBackground: string;
  headerButtonBorder: string;
  headerButtonIcon: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  trustAccent: string;
  trustAccentSoft: string;
  trustAccentBorder: string;
  successAccent: string;
  successAccentSoft: string;
  successAccentBorder: string;
  warningAccent: string;
  warningAccentSoft: string;
  warningAccentBorder: string;
  dangerAccent: string;
  dangerAccentSoft: string;
  dangerAccentBorder: string;
  handle: string;
  shadowColor: string;
  filterAccent: string;
  filterAccentSoft: string;
  filterAccentBorder: string;
  filterAccentHalo: string;
  filterAccentSecondary: string;
}

export interface AdminItemTone extends AccentTone {
  stateLabel: 'urgent' | 'review' | 'approved' | 'destructive';
  summarySurface: string;
  summaryBorder: string;
  proofSurface: string;
  proofBorder: string;
  subtleSurface: string;
  subtleBorder: string;
}

function createAccentTone(
  accent: string,
  accentSecondary: string = accent,
): AccentTone {
  return {
    accent,
    accentSoft: mixColors(accent, IVORY, 0.14),
    accentSurface: withAlpha(accent, 0.12),
    accentBorder: withAlpha(accent, 0.28),
    accentHalo: withAlpha(accentSecondary, 0.2),
    actionFill: mixColors(accent, IVORY, 0.1),
    actionText: OBSIDIAN_BASE,
  };
}

export function buildAdminChromePalette(
  colors: ThemeColors,
  filter: SocialAdminModerationFilter,
): AdminChromePalette {
  const filterTone =
    filter === 'processed'
      ? createAccentTone(MINT, TRUST_BLUE)
      : filter === 'reported'
        ? createAccentTone(CORAL, ROSE)
        : createAccentTone(AMBER, CORAL);

  return {
    screenBackground: OBSIDIAN_BASE,
    screenBackgroundDeep: OBSIDIAN_DEEP,
    screenBackgroundRaised: OBSIDIAN_RAISED,
    screenOverlay: withAlpha(OBSIDIAN_DEEP, 0.92),
    surface: OBSIDIAN_RAISED,
    surfaceRaised: OBSIDIAN_PANEL,
    surfaceMuted: mixColors(OBSIDIAN_PANEL, SLATE, 0.35),
    surfaceGlass: withAlpha(OBSIDIAN_GLOSS, 0.9),
    surfaceStrong: mixColors(OBSIDIAN_GLOSS, IVORY, 0.05),
    borderSubtle: withAlpha(IVORY, 0.09),
    borderStrong: withAlpha(IVORY, 0.16),
    headerSurface: withAlpha(OBSIDIAN_DEEP, 0.94),
    headerBorder: withAlpha(IVORY, 0.08),
    headerButtonBackground: withAlpha(IVORY, 0.045),
    headerButtonBorder: withAlpha(IVORY, 0.1),
    headerButtonIcon: IVORY,
    textPrimary: IVORY,
    textSecondary: FOG,
    textMuted: MUTED,
    textOnAccent: OBSIDIAN_BASE,
    trustAccent: mixColors(colors.primary ?? TRUST_BLUE, TRUST_BLUE, 0.48),
    trustAccentSoft: withAlpha(TRUST_BLUE, 0.16),
    trustAccentBorder: withAlpha(TRUST_BLUE, 0.26),
    successAccent: mixColors(colors.success ?? MINT, MINT, 0.52),
    successAccentSoft: withAlpha(MINT, 0.16),
    successAccentBorder: withAlpha(MINT, 0.28),
    warningAccent: mixColors(colors.warning ?? AMBER, AMBER, 0.64),
    warningAccentSoft: withAlpha(AMBER, 0.16),
    warningAccentBorder: withAlpha(AMBER, 0.28),
    dangerAccent: mixColors(colors.error ?? ROSE, ROSE, 0.62),
    dangerAccentSoft: withAlpha(ROSE, 0.15),
    dangerAccentBorder: withAlpha(ROSE, 0.28),
    handle: withAlpha(IVORY, 0.18),
    shadowColor: '#000000',
    filterAccent: filterTone.accent,
    filterAccentSoft: filterTone.accentSurface,
    filterAccentBorder: filterTone.accentBorder,
    filterAccentHalo: filterTone.accentHalo,
    filterAccentSecondary: filterTone.accentSoft,
  };
}

export function resolveAdminItemTone(
  item: SocialAdminModerationItem,
): AdminItemTone {
  const urgentReports = item.open_reports >= 3 || item.unique_reporters_24h >= 2;

  if (item.moderation_state === 'approved') {
    const tone = createAccentTone(MINT, TRUST_BLUE);
    return {
      ...tone,
      stateLabel: 'approved',
      summarySurface: withAlpha(MINT, 0.12),
      summaryBorder: withAlpha(MINT, 0.24),
      proofSurface: withAlpha(TRUST_BLUE, 0.06),
      proofBorder: withAlpha(TRUST_BLUE, 0.14),
      subtleSurface: withAlpha(IVORY, 0.03),
      subtleBorder: withAlpha(IVORY, 0.08),
    };
  }

  if (
    item.moderation_state === 'removed' ||
    item.moderation_state === 'rejected'
  ) {
    const tone = createAccentTone(ROSE, CORAL);
    return {
      ...tone,
      stateLabel: 'destructive',
      summarySurface: withAlpha(ROSE, 0.12),
      summaryBorder: withAlpha(ROSE, 0.22),
      proofSurface: withAlpha(ROSE, 0.05),
      proofBorder: withAlpha(ROSE, 0.12),
      subtleSurface: withAlpha(ROSE, 0.04),
      subtleBorder: withAlpha(ROSE, 0.08),
    };
  }

  if (item.moderation_state === 'flagged' || urgentReports) {
    const tone = createAccentTone(CORAL, ROSE);
    return {
      ...tone,
      stateLabel: 'urgent',
      summarySurface: withAlpha(CORAL, 0.13),
      summaryBorder: withAlpha(CORAL, 0.24),
      proofSurface: withAlpha(CORAL, 0.06),
      proofBorder: withAlpha(CORAL, 0.14),
      subtleSurface: withAlpha(AMBER, 0.05),
      subtleBorder: withAlpha(AMBER, 0.09),
    };
  }

  const tone = createAccentTone(AMBER, CORAL);
  return {
    ...tone,
    stateLabel: 'review',
    summarySurface: withAlpha(AMBER, 0.12),
    summaryBorder: withAlpha(AMBER, 0.22),
    proofSurface: withAlpha(AMBER, 0.05),
    proofBorder: withAlpha(AMBER, 0.12),
    subtleSurface: withAlpha(IVORY, 0.03),
    subtleBorder: withAlpha(IVORY, 0.08),
  };
}

export function resolveAdminActionSurface(
  tone: AdminActionTone,
  itemTone: AdminItemTone,
  chrome: AdminChromePalette,
) {
  if (tone === 'primary') {
    return {
      backgroundColor: itemTone.accent,
      borderColor: withAlpha(itemTone.accent, 0.44),
      textColor: itemTone.actionText,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: chrome.dangerAccentSoft,
      borderColor: chrome.dangerAccentBorder,
      textColor: chrome.dangerAccent,
    };
  }

  return {
    backgroundColor: chrome.surfaceMuted,
    borderColor: chrome.borderSubtle,
    textColor: chrome.textSecondary,
  };
}

export function resolveAdminSortAccent(
  sortMode: AdminModerationSortMode,
  chrome: AdminChromePalette,
) {
  if (sortMode === 'urgent') {
    return chrome.warningAccent;
  }

  if (sortMode === 'oldest') {
    return chrome.textSecondary;
  }

  return chrome.trustAccent;
}
