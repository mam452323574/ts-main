import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { getRuntimeConfig } from './runtimeConfig';
import { secureStorage } from './secureStorage';

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: Missing Supabase configuration');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
