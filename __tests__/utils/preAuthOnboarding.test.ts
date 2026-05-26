import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPreAuthOnboardingDraft,
  hasPreAuthProfileDraft,
  loadPreAuthOnboardingDraft,
  sanitizePreAuthOnboardingDraft,
  updatePreAuthOnboardingDraft,
} from '@/utils/preAuthOnboarding';

describe('preAuthOnboarding draft helpers', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('loads a default draft when storage is empty', async () => {
    await expect(loadPreAuthOnboardingDraft()).resolves.toEqual({
      selectedTheme: null,
      username: '',
      avatarLocalUri: null,
      avatarSkipped: false,
      email: '',
      createdUserId: null,
      completionIntent: null,
      lastStep: 'intro',
    });
  });

  it('persists only non-sensitive onboarding fields', async () => {
    await updatePreAuthOnboardingDraft({
      selectedTheme: 'light',
      username: 'friendly',
      avatarLocalUri: 'file:///avatar.jpg',
      avatarSkipped: false,
      email: 'test@example.com',
      createdUserId: 'user-123',
      completionIntent: 'signup-email',
      lastStep: 'verification',
      password: 'secret-password',
    } as any);

    const draft = await loadPreAuthOnboardingDraft();
    expect(draft).toEqual({
      selectedTheme: 'light',
      username: 'friendly',
      avatarLocalUri: 'file:///avatar.jpg',
      avatarSkipped: false,
      email: 'test@example.com',
      createdUserId: 'user-123',
      completionIntent: 'signup-email',
      lastStep: 'verification',
    });

    const storedValues = (
      await Promise.all(
        (await AsyncStorage.getAllKeys()).map((key) => AsyncStorage.getItem(key)),
      )
    ).join(' ');
    expect(storedValues).not.toContain('secret-password');
  });

  it('sanitizes invalid stored values', () => {
    expect(
      sanitizePreAuthOnboardingDraft({
        selectedTheme: 'sepia',
        username: 42,
        avatarLocalUri: '',
        avatarSkipped: 'yes',
        email: null,
        createdUserId: '',
        completionIntent: 'login-google',
        lastStep: 'done',
      }),
    ).toEqual({
      selectedTheme: null,
      username: '',
      avatarLocalUri: null,
      avatarSkipped: false,
      email: '',
      createdUserId: null,
      completionIntent: null,
      lastStep: 'intro',
    });
  });

  it('maps legacy stored steps and accepts atomic mobile pages', () => {
    expect(
      sanitizePreAuthOnboardingDraft({
        username: 'friendly',
        lastStep: 'avatar',
      }),
    ).toEqual({
      selectedTheme: null,
      username: 'friendly',
      avatarLocalUri: null,
      avatarSkipped: false,
      email: '',
      createdUserId: null,
      completionIntent: null,
      lastStep: 'avatar',
    });

    expect(
      sanitizePreAuthOnboardingDraft({ lastStep: 'profile' }).lastStep,
    ).toBe('username');
    expect(
      sanitizePreAuthOnboardingDraft({ lastStep: 'account' }).lastStep,
    ).toBe('accountMethod');
  });

  it('clears and detects profile draft fields', async () => {
    const draft = await updatePreAuthOnboardingDraft({
      selectedTheme: 'dark',
      username: 'friendly',
      completionIntent: 'signup-google',
      lastStep: 'appearance',
    });

    expect(hasPreAuthProfileDraft(draft)).toBe(true);

    await clearPreAuthOnboardingDraft();
    const clearedDraft = await loadPreAuthOnboardingDraft();
    expect(hasPreAuthProfileDraft(clearedDraft)).toBe(false);
    expect(clearedDraft.completionIntent).toBeNull();
  });
});
