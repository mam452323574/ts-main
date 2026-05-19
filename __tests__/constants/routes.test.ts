import {
  isPostSignupOnboardingRoute,
  isProtectedRoute,
  isPublicRoute,
  isSharedRoute,
  SCREEN_OPTIONS,
} from '@/constants/routes';

describe('routes privacy policy access', () => {
  it('treats privacy-policy as a shared route', () => {
    expect(isSharedRoute('privacy-policy')).toBe(true);
    expect(isPublicRoute('privacy-policy')).toBe(false);
    expect(isProtectedRoute('privacy-policy')).toBe(false);
  });

  it('keeps login as a public guest-only route', () => {
    expect(isPublicRoute('login')).toBe(true);
    expect(isSharedRoute('login')).toBe(false);
  });

  it('treats post-signup-onboarding as a protected onboarding route', () => {
    expect(isPostSignupOnboardingRoute('post-signup-onboarding')).toBe(true);
    expect(isProtectedRoute('post-signup-onboarding')).toBe(true);
  });

  it('treats coach and entry-offer as protected routes', () => {
    expect(isProtectedRoute('coach')).toBe(true);
    expect(isProtectedRoute('entry-offer')).toBe(true);
  });

  it('treats the admin social moderation console as a protected route', () => {
    expect(isProtectedRoute('admin-social-moderation')).toBe(true);
  });

  it('treats social composer as a protected modal route and social post/comments as protected card routes', () => {
    expect(isProtectedRoute('social-compose')).toBe(true);
    expect(isProtectedRoute('social-post')).toBe(true);
    expect(isProtectedRoute('social-comments')).toBe(true);
    expect(SCREEN_OPTIONS['social-compose']).toEqual({ presentation: 'modal' });
    expect(SCREEN_OPTIONS['social-post']).toEqual({ presentation: 'card' });
    expect(SCREEN_OPTIONS['social-comments']).toEqual({ presentation: 'card' });
  });

  it('treats share-story as a protected modal route', () => {
    expect(isProtectedRoute('share-story')).toBe(true);
    expect(SCREEN_OPTIONS['share-story']).toEqual({ presentation: 'modal' });
  });

  it('treats scan result routes as transparent scan-flow modals', () => {
    expect(isProtectedRoute('scan-preview')).toBe(true);
    expect(isProtectedRoute('scan-result')).toBe(true);
    expect(isProtectedRoute('super-scan-result')).toBe(true);
    expect(SCREEN_OPTIONS['scan-preview']).toEqual({
      presentation: 'fullScreenModal',
    });
    expect(SCREEN_OPTIONS['scan-result']).toEqual({
      presentation: 'transparentModal',
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
    expect(SCREEN_OPTIONS['super-scan-result']).toEqual({
      presentation: 'transparentModal',
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
  });
});
