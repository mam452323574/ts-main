import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPostSignupOnboardingPending,
  getPostSignupOnboardingPendingKey,
  hasPostSignupOnboardingPending,
  markPostSignupOnboardingPending,
} from '@/utils/postSignupOnboarding';

describe('postSignupOnboarding helpers', () => {
  const userId = 'user-123';

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('builds a stable storage key', () => {
    expect(getPostSignupOnboardingPendingKey(userId)).toBe(
      'post_signup_onboarding_pending:user-123'
    );
  });

  it('marks and clears the pending onboarding flag', async () => {
    expect(await hasPostSignupOnboardingPending(userId)).toBe(false);

    await markPostSignupOnboardingPending(userId);
    expect(await hasPostSignupOnboardingPending(userId)).toBe(true);

    await clearPostSignupOnboardingPending(userId);
    expect(await hasPostSignupOnboardingPending(userId)).toBe(false);
  });
});
