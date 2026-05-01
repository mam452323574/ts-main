import AsyncStorage from '@react-native-async-storage/async-storage';

const POST_SIGNUP_ONBOARDING_PENDING_PREFIX = 'post_signup_onboarding_pending:';
const POST_SIGNUP_ONBOARDING_AVATAR_HANDLED_PREFIX =
  'post_signup_onboarding_avatar_handled:';

export function getPostSignupOnboardingPendingKey(userId: string) {
  return `${POST_SIGNUP_ONBOARDING_PENDING_PREFIX}${userId}`;
}

export function getPostSignupOnboardingAvatarHandledKey(userId: string) {
  return `${POST_SIGNUP_ONBOARDING_AVATAR_HANDLED_PREFIX}${userId}`;
}

export async function markPostSignupOnboardingPending(userId: string) {
  if (!userId) {
    return;
  }

  await AsyncStorage.setItem(getPostSignupOnboardingPendingKey(userId), '1');
}

export async function markPostSignupOnboardingAvatarHandled(userId: string) {
  if (!userId) {
    return;
  }

  await AsyncStorage.setItem(
    getPostSignupOnboardingAvatarHandledKey(userId),
    '1',
  );
}

export async function clearPostSignupOnboardingAvatarHandled(userId: string) {
  if (!userId) {
    return;
  }

  await AsyncStorage.removeItem(
    getPostSignupOnboardingAvatarHandledKey(userId),
  );
}

export async function hasPostSignupOnboardingAvatarHandled(userId: string) {
  if (!userId) {
    return false;
  }

  const value = await AsyncStorage.getItem(
    getPostSignupOnboardingAvatarHandledKey(userId),
  );

  return value === '1';
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
