import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';
import { getPrivacyPolicyContent } from '@/constants/privacyPolicy';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const policy = useMemo(() => getPrivacyPolicyContent(locale), [locale]);

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      <Stack.Screen options={{ title: t('settings.privacy_policy') }} />

      <ScreenHeader title={t('settings.privacy_policy')} onBack={() => router.back()} centered />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Surface variant="raised" style={styles.localeSection}>
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
        </Surface>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (colors: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderRadius: BORDER_RADIUS.xl,
  },
  localeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.primaryText,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  localeBadgeText: {
    color: colors.background,
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
