import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';
import { getPrivacyPolicyContent } from '@/constants/privacyPolicy';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const policy = useMemo(() => getPrivacyPolicyContent(locale), [locale]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('settings.privacy_policy') }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ChevronLeft color={colors.primaryText} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.privacy_policy')}</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.localeSection}>
          <View style={styles.localeBadge}>
            <Text style={styles.localeBadgeText}>{policy.label}</Text>
          </View>
          <Text style={styles.pageTitle}>{policy.title}</Text>
          <Text style={styles.lastUpdated}>{policy.lastUpdated}</Text>
          <Text style={styles.paragraph}>{policy.intro}</Text>

          {policy.sections.map((section) => (
            <View key={`${policy.locale}-${section.title}`} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets?.map((bullet) => (
                <Text key={bullet} style={styles.bulletPoint}>
                  {'\u2022'} {bullet}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: insets.top + SPACING.sm,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.page,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  backButton: {
    padding: SPACING.xs,
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  pageTitle: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.md,
  },
  localeSection: {
    padding: SPACING.lg,
    borderRadius: 24,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  localeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  localeBadgeText: {
    color: colors.white,
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  localeTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  lastUpdated: {
    fontSize: SIZES.text12,
    color: colors.gray,
    fontStyle: 'italic',
    marginBottom: SPACING.lg,
  },
  sectionBlock: {
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  paragraph: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    lineHeight: 24,
    marginBottom: SPACING.md,
  },
  bulletPoint: {
    fontSize: SIZES.text14,
    color: colors.primaryText,
    lineHeight: 22,
    marginBottom: SPACING.xs,
    paddingLeft: SPACING.md,
  },
  bottomSpacing: {
    height: SPACING.xl + insets.bottom,
  },
});
