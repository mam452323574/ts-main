import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { PremiumFeature } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';

interface FeatureComparisonTableProps {
  features: PremiumFeature[];
}

export function FeatureComparisonTable({ features }: FeatureComparisonTableProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerColumn}>
          <Text style={styles.headerText}>{t('components.table.header_feature')}</Text>
        </View>
        <View style={[styles.headerColumn, styles.freeColumn]}>
          <Text style={styles.headerText}>{t('components.table.header_free')}</Text>
        </View>
        <View style={[styles.headerColumn, styles.premiumColumn]}>
          <Text style={[styles.headerText, styles.premiumText]}>{t('components.table.header_premium')}</Text>
        </View>
      </View>

      {features.map((feature) => (
        <View key={feature.id} style={styles.row}>
          <View style={styles.featureNameColumn}>
            <Text style={styles.featureName}>{feature.feature_name}</Text>
            {feature.feature_description && (
              <Text style={styles.featureDescription}>{feature.feature_description}</Text>
            )}
          </View>
          <View style={[styles.valueColumn, styles.freeColumn]}>
            {feature.free_tier_description ? (
              <Text style={styles.valueText}>{feature.free_tier_description}</Text>
            ) : (
              <X color={colors.error} size={20} strokeWidth={2} />
            )}
          </View>
          <View style={[styles.valueColumn, styles.premiumColumn]}>
            {feature.premium_tier_description ? (
              <Text style={[styles.valueText, styles.premiumValueText]}>
                {feature.premium_tier_description}
              </Text>
            ) : (
              <Check color={colors.success} size={20} strokeWidth={2} />
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: colors.lightGray,
    backgroundColor: colors.background,
  },
  headerColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  premiumText: {
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
    backgroundColor: colors.cardBackground,
  },
  featureNameColumn: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
  },
  featureName: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  featureDescription: {
    fontSize: SIZES.text12,
    color: colors.gray,
    lineHeight: 16,
  },
  valueColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  valueText: {
    fontSize: SIZES.text12,
    color: colors.primaryText,
    textAlign: 'center',
  },
  premiumValueText: {
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primary,
  },
  freeColumn: {
    backgroundColor: colors.grayLight,
  },
  premiumColumn: {
    backgroundColor: isDark ? colors.primaryLight : '#FFF9F0',
  },
});
