import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';
import { getTermsOfUseContent } from '@/constants/termsOfUse';

const APPLE_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function TermsOfUseScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const terms = useMemo(() => getTermsOfUseContent(locale), [locale]);
  const title = t('premium.subscription_page.terms_link');

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      <Stack.Screen options={{ title }} />

      <ScreenHeader title={title} onBack={() => router.back()} centered />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Surface variant="raised" style={styles.localeSection}>
          <View style={styles.localeBadge}>
            <Text style={styles.localeBadgeText}>{terms.label}</Text>
          </View>
          <Text style={styles.pageTitle}>{terms.title}</Text>
          <Text style={styles.lastUpdated}>{terms.lastUpdated}</Text>
          <Text style={styles.paragraph}>{terms.intro}</Text>

          {terms.sections.map((section) => (
            <View key={`${terms.locale}-${section.title}`} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs.map((paragraph) => {
                const hasAppleEulaLink = paragraph.includes(APPLE_STANDARD_EULA_URL);

                return (
                  <Text key={paragraph} style={styles.paragraph}>
                    {paragraph.replace(` (${APPLE_STANDARD_EULA_URL})`, '')}
                    {hasAppleEulaLink ? (
                      <Text
                        style={styles.link}
                        onPress={() => {
                          void Linking.openURL(APPLE_STANDARD_EULA_URL);
                        }}
                      >
                        {' '}
                        Apple Standard EULA
                      </Text>
                    ) : null}
                  </Text>
                );
              })}
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
    borderCurve: 'continuous',
  },
  localeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.primaryText,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
    borderCurve: 'continuous',
  },
  localeBadgeText: {
    color: colors.background,
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.bold,
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
  link: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  bottomSpacing: {
    height: SPACING.xl + insets.bottom,
  },
});
