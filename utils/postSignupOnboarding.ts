import AsyncStorage from '@react-native-async-storage/async-storage';

const POST_SIGNUP_ONBOARDING_PENDING_PREFIX = 'post_signup_onboarding_pending:';

export function getPostSignupOnboardingPendingKey(userId: string) {
  return `${POST_SIGNUP_ONBOARDING_PENDING_PREFIX}${userId}`;
}

export async function markPostSignupOnboardingPending(userId: string) {
  if (!userId) {
    return;
  }

  await AsyncStorage.setItem(getPostSignupOnboardingPendingKey(userId), '1');
}

export async function clearPostSignupOnboardingPending(userId: string) {
  if (!userId) {
    return;
  }

  await AsyncStorage.removeItem(getPostSignupOnboardingPendingKey(userId));
}

export async function hasPostSignupOnboardingPending(userId: string) {
  if (!userId) {
    return false;
  }

  const value = await AsyncStorage.getItem(
    getPostSignupOnboardingPendingKey(userId)
  );

  return value === '1';
}
