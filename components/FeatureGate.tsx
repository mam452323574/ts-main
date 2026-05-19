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
          <Crown color={colors.background} size={20} fill={colors.background} />
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
    position: 'absolute',
    top: -10,
    right: -10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background, borderCurve: 'continuous',
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
