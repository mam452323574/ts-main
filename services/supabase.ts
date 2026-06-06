import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { tryGetRuntimeConfig } from './runtimeConfig';
import { secureStorage } from './secureStorage';

const AUTH_OPTIONS = {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce' as const,
  },
};

let supabaseConfigError: Error | null = null;

function createSupabaseClient() {
  const result = tryGetRuntimeConfig();

  if (result.ok) {
    return createClient(
      result.config.supabaseUrl,
      result.config.supabaseAnonKey,
      AUTH_OPTIONS,
    );
  }

  // Config indisponible : on NE throw PAS au chargement du module. Un throw ici
  // se produirait AVANT le montage de React/<ErrorBoundary> → exception JS
  // fatale au démarrage → expo-updates abandonne → SIGABRT (rejet App Store
  // 2.1(a), build 1.0.0(6), crash ~0,5 s après le lancement). On crée à la
  // place un client « stub » pointant vers une URL injoignable : toutes les
  // méthodes (.auth/.from/.channel/.rpc/.storage) existent (aucun appel ne
  // throw de façon synchrone) et les requêtes réseau échouent proprement. Le
  // composant `StartupConfigGate` lit `getSupabaseConfigError()` pour afficher
  // un écran d'erreur lisible plutôt que de laisser l'app crasher.
  supabaseConfigError = result.error;
  console.error(
    '[Supabase] CRITICAL: configuration indisponible —',
    result.error.message,
  );

  return createClient(
    'https://configuration-error.invalid',
    'configuration-error',
    AUTH_OPTIONS,
  );
}

export const supabase = createSupabaseClient();

/**
 * Renvoie l'erreur de configuration si le client Supabase n'a pas pu être
 * initialisé avec une vraie config (sinon `null`). Lu par `StartupConfigGate`
 * pour afficher un écran d'erreur au lieu de crasher au lancement.
 */
export function getSupabaseConfigError(): Error | null {
  return supabaseConfigError;
}
