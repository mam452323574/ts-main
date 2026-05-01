import { useMemo } from 'react';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.text}>{t('not_found.text')}</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{t('not_found.link')}</Text>
        </Link>
      </View>
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: colors.background,
  },
  text: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
  },
  link: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
  },
  linkText: {
    fontSize: SIZES.text16,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
