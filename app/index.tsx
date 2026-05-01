import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { usePostSignupOnboardingPending } from '@/hooks/usePostSignupOnboardingPending';

/**
 * Point d'entrée de l'application
 * Redirige vers login ou tabs selon l'état d'authentification
 */
export default function Index() {
  const { user, loading, userProfile, isEmailVerified } = useAuth();
  const { colors } = useTheme();
  const { markStartup } = useStartupDiagnostics();
  const {
    isPending: isPostSignupOnboardingPending,
    isLoading: isPostSignupOnboardingPendingLoading,
  } = usePostSignupOnboardingPending(user?.id);
  const shouldWaitForOnboardingDecision =
    !!user &&
    isEmailVerified &&
    !!userProfile?.username &&
    !userProfile?.has_seen_tutorial &&
    isPostSignupOnboardingPendingLoading;
  const shouldShowPostSignupOnboarding =
    !!user &&
    isEmailVerified &&
    !!userProfile?.username &&
    !userProfile?.has_seen_tutorial &&
    isPostSignupOnboardingPending;

  useEffect(() => {
    if (loading) {
      return;
    }

    markStartup('index-rendered', {
      hasSession: !!user,
      hasProfile: !!userProfile,
      isEmailVerified,
    });
  }, [isEmailVerified, loading, markStartup, user, userProfile]);

  // Attendre le chargement de l'auth
  if (loading || shouldWaitForOnboardingDecision) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Utilisateur non connecté → Login
  if (!user) {
    return <Redirect href="/login" />;
  }

  // Utilisateur connecté mais email non vérifié
  if (userProfile && !isEmailVerified) {
    return <Redirect href="/email-verification" />;
  }

  // Utilisateur connecté mais pas de username
  if (isEmailVerified && !userProfile?.username) {
    return <Redirect href="/username-setup" />;
  }

  if (shouldShowPostSignupOnboarding) {
    return <Redirect href={'/post-signup-onboarding' as any} />;
  }

  // Utilisateur complètement connecté → Tabs
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
