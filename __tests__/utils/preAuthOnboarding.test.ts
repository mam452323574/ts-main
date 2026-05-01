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
      lastStep: 'theme',
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
        lastStep: 'done',
      }),
    ).toEqual({
      selectedTheme: null,
      username: '',
      avatarLocalUri: null,
      avatarSkipped: false,
      email: '',
      createdUserId: null,
      lastStep: 'theme',
    });
  });

  it('clears and detects profile draft fields', async () => {
    const draft = await updatePreAuthOnboardingDraft({
      selectedTheme: 'dark',
      username: 'friendly',
      lastStep: 'avatar',
    });

    expect(hasPreAuthProfileDraft(draft)).toBe(true);

    await clearPreAuthOnboardingDraft();
    expect(hasPreAuthProfileDraft(await loadPreAuthOnboardingDraft())).toBe(false);
  });
});
