jest.unmock('@/services/supabase');

import { supabase } from '@/services/supabase';
import { secureStorage } from '@/services/secureStorage';

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
    storage: {
      from: jest.fn(),
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
  })),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const { createClient } = jest.requireMock('@supabase/supabase-js') as {
  createClient: jest.Mock;
};

describe('supabase', () => {
  it('exports supabase client', () => {
    expect(supabase).toBeDefined();
  });

  it('configures Supabase Auth for Expo React Native persistence', () => {
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        }),
      })
    );
  });

  it('supabase client has auth property', () => {
    expect(supabase.auth).toBeDefined();
  });

  it('supabase client has from method for database queries', () => {
    expect(supabase.from).toBeDefined();
    expect(typeof supabase.from).toBe('function');
  });

  it('supabase client has storage property', () => {
    expect(supabase.storage).toBeDefined();
  });

  it('supabase client has channel method for realtime', () => {
    expect(supabase.channel).toBeDefined();
    expect(typeof supabase.channel).toBe('function');
  });

  it('can call auth methods', () => {
    expect(supabase.auth.getSession).toBeDefined();
    expect(supabase.auth.signInWithPassword).toBeDefined();
    expect(supabase.auth.signUp).toBeDefined();
    expect(supabase.auth.signOut).toBeDefined();
  });

  it('can call from method with table name', () => {
    const result = supabase.from('test_table');
    expect(result).toBeDefined();
  });

  it('can call channel method', () => {
    const result = supabase.channel('test_channel');
    expect(result).toBeDefined();
  });
});
