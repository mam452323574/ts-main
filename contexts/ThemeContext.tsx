import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT_COLORS, DARK_COLORS, ThemeType } from '@/constants/theme';

const THEME_STORAGE_KEY = 'user_theme_preference';

interface ThemeContextType {
    theme: ThemeType;
    colors: typeof LIGHT_COLORS;
    toggleTheme: () => void;
    setTheme: (theme: ThemeType) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeType>('dark'); // Default to dark as requested

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme === 'light' || savedTheme === 'dark') {
                setThemeState(savedTheme);
            }
        } catch (error) {
            console.error('Failed to load theme preference:', error);
        }
    };

    const setTheme = async (newTheme: ThemeType) => {
        try {
            setThemeState(newTheme);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
        } catch (error) {
            console.error('Failed to save theme preference:', error);
        }
    };

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
