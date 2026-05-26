import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';

interface NextScanTimerProps {
  nextAvailableDate: number;
  scanLabel?: string;
  onTimerComplete?: () => void;
  textColor?: string;
  iconColor?: string;
  mode?: 'default' | 'scannerCompact' | 'scannerChipCompact' | 'homeCompact';
  serverClockOffsetMs?: number;
  padHours?: boolean;
}

export function NextScanTimer({
  nextAvailableDate,
  scanLabel,
  onTimerComplete,
  textColor,
  iconColor,
  mode = 'default',
  serverClockOffsetMs = 0,
  padHours = false,
}: NextScanTimerProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isScannerCompact = mode === 'scannerCompact';
  const isScannerChipCompact = mode === 'scannerChipCompact';
  const isHomeCompact = mode === 'homeCompact';
  const isCompactMode = isScannerCompact || isScannerChipCompact || isHomeCompact;
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const onTimerCompleteRef = useRef(onTimerComplete);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    onTimerCompleteRef.current = onTimerComplete;
  }, [onTimerComplete]);

  useEffect(() => {
    hasCompletedRef.current = false;
    setIsAvailable(false);
  }, [nextAvailableDate, serverClockOffsetMs]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let activeIntervalMs: number | null = null;

    const ensureInterval = (nextIntervalMs: number) => {
      if (activeIntervalMs === nextIntervalMs) {
        return;
      }

      if (intervalId) {
        clearInterval(intervalId);
      }

      activeIntervalMs = nextIntervalMs;
      intervalId = setInterval(updateTimer, nextIntervalMs);
    };

    const updateTimer = () => {
      const now = Date.now() + serverClockOffsetMs;
      const diff = nextAvailableDate - now;

      if (diff <= 0) {
        setTimeRemaining('');
        setIsAvailable(true);
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onTimerCompleteRef.current?.();
        }
        if (intervalId) clearInterval(intervalId);
        activeIntervalMs = null;
        return;
      }

      ensureInterval(diff <= 120000 ? 1000 : 60000);
      setIsAvailable(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const minuteUnit = isCompactMode ? 'm' : t('common.time.min');
      const hourText = padHours ? String(hours).padStart(2, '0') : String(hours);
      const minuteText = padHours ? String(minutes).padStart(2, '0') : String(minutes);

      if (days > 0) {
        setTimeRemaining(`${days}${t('common.time.d')} ${hours}${t('common.time.h')}`);
      } else if (hours > 0) {
        setTimeRemaining(
          isScannerChipCompact
            ? `${hours}${t('common.time.h')}${String(minutes).padStart(2, '0')}`
            : `${hourText}${t('common.time.h')} ${minuteText}${minuteUnit}`
        );
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}${minuteUnit}`);
      } else if (isScannerChipCompact) {
        setTimeRemaining(`1${minuteUnit}`);
      } else {
        setTimeRemaining(`${seconds}${t('common.time.s')}`);
      }
    };

    updateTimer();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isCompactMode, isScannerChipCompact, nextAvailableDate, padHours, serverClockOffsetMs, t]);

  if (isAvailable) {
    return (
      <View
        style={[
          styles.container,
          isScannerCompact && styles.scannerCompactContainer,
          isScannerChipCompact && styles.scannerChipCompactContainer,
          isHomeCompact && styles.homeCompactContainer,
        ]}
      >
        {!isCompactMode && <Clock color={colors.success} size={12} strokeWidth={2.5} />}
        <Text
          style={[
            styles.text,
            styles.availableText,
            isScannerCompact && styles.scannerCompactText,
            isScannerChipCompact && styles.scannerChipCompactText,
            isHomeCompact && styles.homeCompactText,
          ]}
          numberOfLines={1}
        >
          {t('common.available')}
        </Text>
      </View>
    );
  }

  const timerText = isScannerChipCompact
    ? timeRemaining
    : isScannerCompact || isHomeCompact
      ? `${scanLabel ? `${scanLabel} ` : ''}${timeRemaining}`
      : `${scanLabel ? `${scanLabel} ` : ''}${t('common.in')} ${timeRemaining}`;

  return (
    <View
      style={[
        styles.container,
        isScannerCompact && styles.scannerCompactContainer,
        isScannerChipCompact && styles.scannerChipCompactContainer,
        isHomeCompact && styles.homeCompactContainer,
      ]}
    >
      {!isScannerCompact && !isHomeCompact && (
        <Clock
          color={iconColor || 'rgba(255, 255, 255, 0.7)'}
          size={isScannerChipCompact ? 9 : 12}
          strokeWidth={2.5}
        />
      )}
      <Text
        style={[
          styles.text,
          textColor ? { color: textColor } : undefined,
          isScannerCompact && styles.scannerCompactText,
          isScannerChipCompact && styles.scannerChipCompactText,
          isHomeCompact && styles.homeCompactText,
        ]}
        numberOfLines={isHomeCompact ? 2 : 1}
        ellipsizeMode="tail"
      >
        {timerText}
      </Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    gap: 4,
    marginTop: SPACING.xs,
  },
  text: {
    fontSize: SIZES.text10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: FONT_WEIGHTS.medium,
    fontStyle: 'italic',
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  scannerCompactContainer: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginTop: 0,
    minHeight: 9,
    width: '100%',
  },
  scannerCompactText: {
    fontSize: 8,
    lineHeight: 9,
    fontStyle: 'normal',
    textAlign: 'center',
    width: '100%',
  },
  scannerChipCompactContainer: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginTop: 0,
    minHeight: 9,
    width: '100%',
    gap: 2,
  },
  scannerChipCompactText: {
    fontSize: 8,
    lineHeight: 9,
    fontStyle: 'normal',
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  // homeCompact: layout vertical sur 2 lignes pour les mini-cards de la Home
  // où l'espace horizontal est trop étroit pour "Nouveau scan dans 23h 59m"
  // sur une seule ligne. Texte volontairement légèrement plus grand que
  // scannerCompact pour rester lisible quand il wrap.
  homeCompactContainer: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginTop: 0,
    width: '100%',
  },
  homeCompactText: {
    fontSize: SIZES.text10,
    lineHeight: 12,
    fontStyle: 'normal',
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
    width: '100%',
  },
  availableText: {
    color: colors.success,
    fontStyle: 'normal',
  },
});
