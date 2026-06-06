import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { COLORS, SIZES, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { getSupabaseConfigError } from '@/services/supabase';

/**
 * Affiche un écran d'erreur lisible si la configuration de l'app n'a pas pu être
 * chargée au démarrage, au lieu de laisser un throw au niveau module crasher le
 * lancement avant le montage de React (ce que `<ErrorBoundary>` ne peut PAS
 * intercepter). Doit rester EN DEHORS de `LanguageProvider` : l'i18n peut ne pas
 * être hydratée, donc le texte est en anglais en dur. Le message d'erreur est
 * affiché même en prod (volontaire) car cet écran n'apparaît que si la config
 * est cassée — c'est notre seul moyen de diagnostiquer depuis un build store
 * (l'IPS d'Apple ne contient pas le message JS). Cf. rejet App Store 2.1(a)
 * build 1.0.0(6).
 */
export function StartupConfigGate({ children }: { children: React.ReactNode }) {
  const configError = getSupabaseConfigError();

  if (!configError) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>App configuration error</Text>
        <Text style={styles.message}>
          SelfLens could not load its configuration and cannot start safely.
          Please make sure you are on the latest version. If this keeps
          happening, contact contact@selflens.org.
        </Text>
        <ScrollView style={styles.details}>
          <Text style={styles.detailsText}>{configError.message}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.page,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.xl,
    maxWidth: 400,
    width: '100%',
    borderCurve: 'continuous',
  },
  title: {
    fontSize: SIZES.xxxl,
    fontWeight: 'bold',
    color: COLORS.error,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    fontSize: SIZES.md,
    color: COLORS.primaryText,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  details: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    maxHeight: 160,
    width: '100%',
    borderCurve: 'continuous',
  },
  detailsText: {
    fontSize: SIZES.sm,
    color: COLORS.error,
    fontFamily: 'monospace',
  },
});
