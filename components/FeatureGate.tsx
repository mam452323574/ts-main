import { ReactNode, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Crown, Lock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { FONT_WEIGHTS, SIZES, SPACING, BORDER_RADIUS, SHADOWS, withAlpha } from '@/constants/theme';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';
import { Squircle } from '@/components/Squircle';

interface FeatureGateProps {
  featureKey: string;
  featureName: string;
  featureDescription?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({
  featureName,
  featureDescription,
  children,
  fallback,
}: FeatureGateProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isPremium = hasPremiumAccessFromProfile(userProfile);

  const handleUpgrade = () => {
    router.push('/premium-upgrade');
  };

  if (isPremium) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.lockContainer}>
        <Squircle style={styles.iconBackground}>
          <Lock color={colors.primary} size={48} />
        </Squircle>
        <Squircle style={styles.crownBadge}>
          <Crown color={colors.background} size={18} fill={colors.background} />
        </Squircle>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Crown color={colors.gold} size={32} fill={withAlpha(colors.gold, 0.24)} />
        </View>
        <Text style={styles.title}>{t('components.feature_gate.title')}</Text>
      </View>
      <Text style={styles.featureName}>{featureName}</Text>

      {featureDescription && (
        <Text style={styles.description}>{featureDescription}</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.upgradeButton, pressed && styles.upgradeButtonPressed]}
        onPress={handleUpgrade}
      >
        <Crown color={colors.background} size={20} fill={colors.background} />
        <Text style={styles.upgradeButtonText}>{t('components.feature_gate.upgrade_btn')}</Text>
      </Pressable>

      <Text style={styles.hint}>
        {t('components.feature_gate.hint')}
      </Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  content: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    marginBottom: SPACING.xs,
  },
  upgradeButtonPressed: {
    opacity: 0.8,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: colors.background,
  },
  lockContainer: {
    position: 'relative',
    marginBottom: SPACING.xl,
  },
  iconBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.28),
    ...SHADOWS.card, borderCurve: 'continuous',
  },
  crownBadge: {
    // Polish (audit 2026-05): la couronne était positionnée à -10/-10 avec
    // une taille de 48 et une bordure de 3px. Combinée à `SHADOWS.card`
    // appliqué sur `iconBackground` (shadowRadius 24, shadowOpacity 0.2),
    // ça donnait un halo gris-sombre rayonnant SOUS la couronne qui
    // dépassait du conteneur → effet "aura sale".
    // Correction :
    // - Réduction de la taille (48 → 36) pour des proportions plus saines.
    // - Réduction de l'offset (-10 → -4) pour ne pas trop déborder de
    //   l'iconBackground tout en gardant un léger effet "badge épinglé".
    // - Bordure 3 → 2 (l'épaisseur visuelle reste forte sur 36px).
    // - Ombre légère INTENTIONNELLE en or pour détacher la pastille du
    //   shadow gris du parent, au lieu de la laisser fondre dedans.
    position: 'absolute',
    top: -4,
    right: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 5,
    elevation: 3,
    borderCurve: 'continuous',
  },
  title: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.gray,
    marginBottom: SPACING.sm,
  },
  featureName: {
    fontSize: SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: SIZES.md,
    color: colors.darkGray,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    maxWidth: 300,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryText,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.2),
    ...SHADOWS.button, borderCurve: 'continuous',
  },
  upgradeButtonText: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.background,
  },
  hint: {
    fontSize: SIZES.sm,
    color: colors.gray,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
