import React from 'react';
import { render, screen } from '@testing-library/react-native';

import PrivacyPolicyScreen from '@/app/privacy-policy';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#F5F7FB',
      cardBackground: '#FFFFFF',
      primaryText: '#111827',
      primary: '#2563EB',
      lightGray: '#E5E7EB',
      gray: '#6B7280',
      white: '#FFFFFF',
    },
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'it',
    t: (key: string) =>
      (
        {
          'settings.privacy_policy': 'Informativa sulla privacy',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders only the active locale policy content', () => {
    render(<PrivacyPolicyScreen />);

    expect(screen.getAllByText('Informativa sulla privacy')).toHaveLength(2);
    expect(screen.getByText('Ultimo aggiornamento: 26 aprile 2026')).toBeTruthy();
    expect(
      screen.getByText(
        'Questa pagina spiega come SelfLens raccoglie, utilizza e protegge i dati necessari per eseguire gli scan salute e far funzionare il servizio.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('3.1 Dati del volto')).toBeTruthy();
    expect(
      screen.getByText(
        'SelfLens non usa questi dati per identificare una persona, creare identificazione biometrica, autenticare un utente con riconoscimento facciale, mostrare pubblicita o addestrare modelli di intelligenza artificiale.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Privacy Policy / Politique de confidentialite')).toBeNull();
    expect(screen.queryByText('EN')).toBeNull();
    expect(screen.queryByText('FR')).toBeNull();
    expect(screen.getByText('IT')).toBeTruthy();
  });
});
