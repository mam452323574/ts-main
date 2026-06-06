import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemeType } from '@/constants/theme';

export type PreAuthOnboardingStep =
  | 'intro'
  | 'username'
  | 'avatar'
  | 'appearance'
  | 'accountMethod'
  | 'emailCredentials'
  | 'verification';

export type PreAuthCompletionIntent =
  | 'signup-email'
  | 'signup-google'
  | 'signup-apple';

export interface PreAuthOnboardingDraft {
  selectedTheme: ThemeType | null;
  username: string;
  avatarLocalUri: string | null;
  avatarSkipped: boolean;
  email: string;
  createdUserId: string | null;
  completionIntent: PreAuthCompletionIntent | null;
  lastStep: PreAuthOnboardingStep;
}

const PRE_AUTH_ONBOARDING_DRAFT_KEY = 'pre_auth_onboarding_draft_v1';

const DEFAULT_PRE_AUTH_ONBOARDING_DRAFT: PreAuthOnboardingDraft = {
  selectedTheme: null,
  username: '',
  avatarLocalUri: null,
  avatarSkipped: false,
  email: '',
  createdUserId: null,
  completionIntent: null,
  lastStep: 'intro',
};

const VALID_STEPS: ReadonlySet<string> = new Set([
  'intro',
  'username',
  'avatar',
  'appearance',
  'accountMethod',
  'emailCredentials',
  'verification',
]);

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readOptionalString(value: unknown) {
  const stringValue = readString(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function readTheme(value: unknown): ThemeType | null {
  return value === 'light' || value === 'dark' ? value : null;
}

function readCompletionIntent(value: unknown): PreAuthCompletionIntent | null {
  return value === 'signup-email' ||
    value === 'signup-google' ||
    value === 'signup-apple'
    ? value
    : null;
}

function readStep(value: unknown): PreAuthOnboardingStep {
  if (typeof value !== 'string') {
    return 'intro';
  }

  if (VALID_STEPS.has(value)) {
    return value as PreAuthOnboardingStep;
  }

  switch (value) {
    case 'theme':
      return 'appearance';
    case 'username':
      return 'username';
    case 'avatar':
      return 'avatar';
    case 'profile':
      return 'username';
    case 'account':
      return 'accountMethod';
    default:
      return 'intro';
  }
}

export function sanitizePreAuthOnboardingDraft(
  value: unknown,
): PreAuthOnboardingDraft {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    selectedTheme: readTheme(record.selectedTheme),
    username: readString(record.username),
    avatarLocalUri: readOptionalString(record.avatarLocalUri),
    avatarSkipped: record.avatarSkipped === true,
    email: readString(record.email),
    createdUserId: readOptionalString(record.createdUserId),
    completionIntent: readCompletionIntent(record.completionIntent),
    lastStep: readStep(record.lastStep),
  };
}

export async function loadPreAuthOnboardingDraft() {
  try {
    const rawDraft = await AsyncStorage.getItem(PRE_AUTH_ONBOARDING_DRAFT_KEY);
    if (!rawDraft) {
      return { ...DEFAULT_PRE_AUTH_ONBOARDING_DRAFT };
    }

    return sanitizePreAuthOnboardingDraft(JSON.parse(rawDraft));
  } catch {
    return { ...DEFAULT_PRE_AUTH_ONBOARDING_DRAFT };
  }
}

export async function savePreAuthOnboardingDraft(
  draft: Partial<PreAuthOnboardingDraft> | Record<string, unknown>,
) {
  const sanitizedDraft = sanitizePreAuthOnboardingDraft(draft);
  await AsyncStorage.setItem(
    PRE_AUTH_ONBOARDING_DRAFT_KEY,
    JSON.stringify(sanitizedDraft),
  );
  return sanitizedDraft;
}

export async function updatePreAuthOnboardingDraft(
  patch: Partial<PreAuthOnboardingDraft> | Record<string, unknown>,
) {
  const currentDraft = await loadPreAuthOnboardingDraft();
  const nextDraft = sanitizePreAuthOnboardingDraft({
    ...currentDraft,
    ...patch,
  });

  await AsyncStorage.setItem(
    PRE_AUTH_ONBOARDING_DRAFT_KEY,
    JSON.stringify(nextDraft),
  );

  return nextDraft;
}

export async function clearPreAuthOnboardingDraft() {
  await AsyncStorage.removeItem(PRE_AUTH_ONBOARDING_DRAFT_KEY);
}

export function hasPreAuthProfileDraft(draft: PreAuthOnboardingDraft) {
  return Boolean(
    draft.username ||
      draft.avatarLocalUri ||
      draft.avatarSkipped ||
      draft.selectedTheme,
  );
}
