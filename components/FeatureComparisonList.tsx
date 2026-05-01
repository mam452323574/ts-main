import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, Check, X } from 'lucide-react-native';
import { PremiumFeature } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';

interface FeatureComparisonListProps {
  features: PremiumFeature[];
}

export function FeatureComparisonList({ features }: FeatureComparisonListProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const groupedFeatures = features.reduce((acc, feature) => {
    const category = feature.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(feature);
    return acc;
  }, {} as Record<string, PremiumFeature[]>);

  return (
    <View style={styles.container}>
      {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
        <View key={category} style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            {t(`premium_features.categories.${category}`, { defaultValue: category })}
          </Text>
          {categoryFeatures.map((feature) => {
            const featureKey = `premium_features.list.${feature.feature_key}`;

            return (
              <View key={feature.id} style={styles.featureCard}>
                <View style={styles.featureHeader}>
                  <Text style={styles.featureName}>
                    {t(`${featureKey}.title`, { defaultValue: feature.feature_name })}
                  </Text>
                  {(feature.feature_description || t(`${featureKey}.description`, { defaultValue: '' })) ? (
                    <Text style={styles.featureDescription}>
                      {t(`${featureKey}.description`, { defaultValue: feature.feature_description || '' })}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.comparisonRow}>
                  <View style={styles.tierColumn}>
                    <Text style={styles.tierLabel}>{t('components.feature_list.free')}</Text>
                    <View style={styles.tierValueContainer}>
                      {(feature.free_tier_description || t(`${featureKey}.free`, { defaultValue: '' })) ? (
                        <Text style={styles.freeTierValue}>
                          {t(`${featureKey}.free`, { defaultValue: feature.free_tier_description || '' })}
                        </Text>
                      ) : (
                        <X color={colors.error} size={20} strokeWidth={2} />
                      )}
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={[styles.tierColumn, styles.premiumColumn]}>
                    <View style={styles.premiumLabelContainer}>
                      <Text style={styles.premiumLabel}>{t('components.feature_list.premium')}</Text>
                      <Sparkles color={colors.primary} size={16} fill={colors.primary} />
                    </View>
                    <View style={styles.tierValueContainer}>
                      {(feature.premium_tier_description || t(`${featureKey}.premium`, { defaultValue: '' })) ? (
                        <Text style={styles.premiumTierValue}>
                          {t(`${featureKey}.premium`, { defaultValue: feature.premium_tier_description || '' })}
                        </Text>
                      ) : (
                        <Check color={colors.success} size={20} strokeWidth={2} />
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  categorySection: {
    marginBottom: SPACING.xl,
  },
  categoryTitle: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featureCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  featureHeader: {
    marginBottom: SPACING.md,
  },
  featureName: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  featureDescription: {
    fontSize: SIZES.text14,
    color: colors.gray,
    lineHeight: 20,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tierColumn: {
    flex: 1,
    alignItems: 'center',
  },
  premiumColumn: {
    backgroundColor: isDark ? colors.primaryLight : '#F0F8FF',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
  },
  tierLabel: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.gray,
    marginBottom: SPACING.sm,
  },
  premiumLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  premiumLabel: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  tierValueContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  freeTierValue: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    textAlign: 'center',
  },
  premiumTierValue: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.lightGray,
    marginHorizontal: SPACING.md,
  },
});
