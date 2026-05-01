import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { DARK_COLORS } from '@/constants/theme';
import {
  DEFAULT_LOCALE,
  LANGUAGE_STORAGE_KEY,
  USER_DEFAULT_LOCALE,
  isSupportedLocale,
  normalizeLocaleCode,
  type LocaleCode,
} from '@/i18n/config';
import { activateLocaleWithFallbacks } from '@/i18n/internal/catalogLoader';
import { i18n, setI18nLocale } from '@/i18n/translations';

interface LanguageContextType {
  locale: LocaleCode;
  isChangingLanguage: boolean;
  isLocaleReady: boolean;
  changeLanguage: (lang: LocaleCode) => Promise<void>;
  t: (scope: string, options?: any) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocale] = useState<LocaleCode>(USER_DEFAULT_LOCALE);
  const [isLocaleReady, setIsLocaleReady] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const deviceLocale = Localization.getLocales()[0]?.languageCode;
        const preferredLocale = savedLanguage
          ? normalizeLocaleCode(savedLanguage, USER_DEFAULT_LOCALE)
          : isSupportedLocale(deviceLocale)
            ? deviceLocale
            : USER_DEFAULT_LOCALE;
        const activeLocale = await activateLocaleWithFallbacks(setI18nLocale, [
          preferredLocale,
          USER_DEFAULT_LOCALE,
          DEFAULT_LOCALE,
        ]);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setLocale(activeLocale);
          setIsLocaleReady(true);
        });
      } catch (error) {
        console.error('Failed to load language', error);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setLocale(DEFAULT_LOCALE);
          setIsLocaleReady(true);
        });
      }
    };

    void loadLanguage();

    return () => {
      isMounted = false;
    };
  }, []);

  const changeLanguage = useCallback(
    async (lang: LocaleCode) => {
      if (isChangingLanguage || lang === locale) {
        return;
      }

      try {
        setIsChangingLanguage(true);
        await setI18nLocale(lang);
        startTransition(() => {
          setLocale(lang);
        });
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch (error) {
        console.error('Failed to save language', error);
      } finally {
        setIsChangingLanguage(false);
      }
    },
    [isChangingLanguage, locale],
  );

  const t = useCallback((scope: string, options?: any) => {
    return i18n.t(scope, options);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      isChangingLanguage,
      isLocaleReady,
      changeLanguage,
      t,
    }),
    [changeLanguage, isChangingLanguage, isLocaleReady, locale, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {isLocaleReady ? (
        children
      ) : (
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={DARK_COLORS.primary} />
        </View>
      )}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_COLORS.background,
  },
});
