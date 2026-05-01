/**
 * Configuration centralisée des routes de l'application
 * Facilite la maintenance et évite la duplication
 */

// Routes invite uniquement
export const PUBLIC_ROUTES = ['login', 'signup'] as const;

// Routes accessibles quel que soit l'etat d'authentification
export const SHARED_ROUTES = ['privacy-policy'] as const;

// Routes de vérification d'email
export const EMAIL_VERIFICATION_ROUTES = ['email-verification'] as const;

// Routes de configuration du profil (après vérification email)
export const PROFILE_SETUP_ROUTES = ['username-setup'] as const;

export const POST_SIGNUP_ONBOARDING_ROUTES = [
  'post-signup-onboarding',
] as const;

// Routes protégées nécessitant une authentification complète
export const PROTECTED_ROUTES = [
  '(tabs)',
  'analytics',
  'coach',
  'admin-social-moderation',
  'entry-offer',
  'social-compose',
  'social-post',
  'social-comments',
  'recipes',
  'exercises',
  'scan-preview',
  'scan-result',
  'share-story',
  'settings',
  'notifications',
  'notification-settings',
  'post-signup-onboarding',
] as const;

// Routes admin — sous-ensemble de PROTECTED_ROUTES qui exige
// userProfile.account_tier === 'admin'. Voir P1-1 dans
// FRONTEND_SECURITY_AUDIT.md (défense en profondeur, le RLS / Edge
// Functions Supabase reste autoritaire côté serveur).
export const ADMIN_ROUTES = ['admin-social-moderation'] as const;

// Routes premium — sous-ensemble de PROTECTED_ROUTES qui exige
// userProfile.account_tier === 'premium' (ou 'admin'). Voir P2-D dans
// FRONTEND_SECURITY_AUDIT.md (défense en profondeur + UX cohérente,
// le RLS / Edge Functions Supabase reste autoritaire).
export const PREMIUM_ROUTES = [
  'coach',
  'coach-history',
  'super-scan-result',
  'recipes',
  'exercises',
  'entry-offer',
] as const;

// Routes spéciales (accessibles dans plusieurs états)
export const SPECIAL_ROUTES = ['premium-upgrade'] as const;

// Configuration des écrans avec leurs options de présentation
export const SCREEN_OPTIONS = {
  'entry-offer': { presentation: 'modal' as const },
  'social-compose': { presentation: 'modal' as const },
  'social-post': { presentation: 'card' as const },
  'social-comments': { presentation: 'card' as const },
  'premium-upgrade': { presentation: 'modal' as const },
  'settings': { presentation: 'modal' as const },
  'premium-plan': { presentation: 'modal' as const },
  'notifications': { presentation: 'modal' as const },
  'notification-settings': { presentation: 'modal' as const },
  'recipes': { presentation: 'modal' as const },
  'exercises': { presentation: 'modal' as const },
  'scan-preview': { presentation: 'fullScreenModal' as const },
  'scan-result': { presentation: 'modal' as const },
  'share-story': { presentation: 'modal' as const },
} as const;

// Types dérivés des configurations
export type PublicRoute = typeof PUBLIC_ROUTES[number];
export type SharedRoute = typeof SHARED_ROUTES[number];
export type EmailVerificationRoute = typeof EMAIL_VERIFICATION_ROUTES[number];
export type ProfileSetupRoute = typeof PROFILE_SETUP_ROUTES[number];
export type PostSignupOnboardingRoute =
  typeof POST_SIGNUP_ONBOARDING_ROUTES[number];
export type ProtectedRoute = typeof PROTECTED_ROUTES[number];
export type AdminRoute = typeof ADMIN_ROUTES[number];
export type PremiumRoute = typeof PREMIUM_ROUTES[number];
export type SpecialRoute = typeof SPECIAL_ROUTES[number];

// Helpers pour vérifier le type de route
export const isPublicRoute = (segment: string): boolean => 
  PUBLIC_ROUTES.includes(segment as PublicRoute);

export const isSharedRoute = (segment: string): boolean =>
  SHARED_ROUTES.includes(segment as SharedRoute);

export const isEmailVerificationRoute = (segment: string): boolean =>
  EMAIL_VERIFICATION_ROUTES.includes(segment as EmailVerificationRoute);

export const isProfileSetupRoute = (segment: string): boolean =>
  PROFILE_SETUP_ROUTES.includes(segment as ProfileSetupRoute);

export const isPostSignupOnboardingRoute = (segment: string): boolean =>
  POST_SIGNUP_ONBOARDING_ROUTES.includes(
    segment as PostSignupOnboardingRoute
  );

export const isProtectedRoute = (segment: string): boolean =>
  PROTECTED_ROUTES.includes(segment as ProtectedRoute);

export const isAdminRoute = (segment: string): boolean =>
  ADMIN_ROUTES.includes(segment as AdminRoute);

export const isPremiumRoute = (segment: string): boolean =>
  PREMIUM_ROUTES.includes(segment as PremiumRoute);

export const isSpecialRoute = (segment: string): boolean =>
  SPECIAL_ROUTES.includes(segment as SpecialRoute);
