import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { LanguageSelector } from '../../components/LanguageSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

jest.unmock('@/components/LanguageSelector');
jest.unmock('../../components/LanguageSelector');

jest.mock('../../contexts/LanguageContext', () => ({
  useLanguage: jest.fn(),
}));

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return {
    Check: () => <Text>CheckIcon</Text>,
    ChevronDown: () => <Text>ChevronDownIcon</Text>,
    Globe: () => <Text>GlobeIcon</Text>,
    X: () => <Text>XIcon</Text>,
  };
});

describe('LanguageSelector', () => {
  const mockChangeLanguage = jest.fn();
  const mockT = jest.fn((key: string) => key);

  beforeEach(() => {
    jest.clearAllMocks();

    (useLanguage as jest.Mock).mockReturnValue({
      locale: 'fr',
      changeLanguage: mockChangeLanguage,
      isChangingLanguage: false,
      isLocaleReady: true,
      t: mockT,
    });

    (useTheme as jest.Mock).mockReturnValue({
      colors: {
        primary: '#FF5733',
        lightGray: '#D3D3D3',
        primaryText: '#000000',
        cardBackground: '#FFFFFF',
        gray: '#808080',
      },
      isDark: false,
    });
  });

  it('renders with current language', () => {
    const { getByText } = render(<LanguageSelector />);

    expect(getByText('🇫🇷')).toBeTruthy();
    expect(getByText('FR')).toBeTruthy();
  });

  it('opens modal on press', () => {
    const { getByText } = render(<LanguageSelector />);

    fireEvent.press(getByText('FR').parent!);

    expect(getByText('settings.select_language_title')).toBeTruthy();
    expect(getByText('English')).toBeTruthy();
    expect(getByText('GlobeIcon')).toBeTruthy();
  });

  it('selects a language and closes modal', () => {
    const { getByText } = render(<LanguageSelector />);

    fireEvent.press(getByText('FR').parent!);
    fireEvent.press(getByText('English'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('closes modal when close button is pressed', () => {
    const { getByText } = render(<LanguageSelector />);

    fireEvent.press(getByText('FR').parent!);
    fireEvent.press(getByText('XIcon').parent!);
  });

  it('closes modal when backdrop is pressed', () => {
    const { getByText, getByTestId } = render(<LanguageSelector />);

    fireEvent.press(getByText('FR').parent!);
    fireEvent.press(getByTestId('modal-backdrop'));
  });

  it('applies selected styles to current language', () => {
    const { getByText } = render(<LanguageSelector />);

    fireEvent.press(getByText('FR').parent!);

    const frOption = getByText('Français');
    expect(frOption.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#FF5733', fontWeight: '700' })]));

    const enOption = getByText('English');
    expect(enOption.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#000000', fontWeight: '500' })]));
  });
});
