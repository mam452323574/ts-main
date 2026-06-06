import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthHero, AuthShell } from '@/components/auth';
import { Button } from '@/components/Button';
import { SPACING } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    markStartup('welcome-rendered');
    settleStartup('welcome-rendered');
  }, [markStartup, settleStartup]);

  return (
    <AuthShell>
      <View style={styles.page}>
        <View style={styles.body}>
          <AuthHero
            variant="intro"
            brand="SELFLENS"
            title={t('auth.welcome_title')}
            subtitle={t('auth.welcome_subtitle')}
          />
        </View>
        <View style={styles.footer}>
          <Button
            title={t('auth.welcome_create')}
            onPress={() => router.push('/signup')}
            variant="primary"
            size="lg"
            flat
            testID="welcome-create-account"
          />
          <Button
            title={t('auth.welcome_login')}
            onPress={() => router.push('/login')}
            variant="outline"
            tone="neutral"
            size="lg"
            flat
            testID="welcome-login"
          />
        </View>
      </View>
    </AuthShell>
  );
}

const createStyles = (_colors: any) =>
  StyleSheet.create({
    page: {
      flex: 1,
      justifyContent: 'space-between',
      gap: SPACING.lg,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      paddingBottom: SPACING.xl,
    },
    footer: {
      gap: SPACING.md,
    },
  });
