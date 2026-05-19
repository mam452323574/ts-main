import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ScanEligibilityResponse } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';
import { NextScanTimer } from '@/components/NextScanTimer';
import { Squircle } from '@/components/Squircle';

interface ScanLimitIndicatorProps {
  eligibility?: ScanEligibilityResponse;
  isPremium?: boolean;
  onLimitReachedPress?: () => void;
  onTimerComplete?: () => void;
}

function parseTimestampMs(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ScanLimitIndicator({
  eligibility,
  onLimitReachedPress,
  onTimerComplete,
}: ScanLimitIndicatorProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Guard against undefined eligibility (e.g., after sign-out)
  if (!eligibility) {
    return null;
  }

  const currentCount = eligibility.current_count || 0;  // Scans utilisés
  const limit = Math.max(eligibility.limit || 1, 1);    // Limite totale
  const remaining =
    typeof eligibility.remaining === 'number'
      ? Math.max(0, eligibility.remaining)
      : typeof eligibility.available === 'number'
        ? Math.max(0, eligibility.available)
      : Math.max(0, limit - currentCount);              // Scans disponibles
  const progress = (remaining / limit) * 100;           // Barre de progression basée sur les scans restants (décroissante)
  const hasRemainingScans = remaining > 0;
  const isLimitReached = !eligibility.allowed || !hasRemainingScans;
  const nextRechargeAt =
    parseTimestampMs(eligibility.next_recharge_at) ??
    parseTimestampMs(eligibility.nextRechargeAt) ??
    parseTimestampMs(eligibility.next_available_date);
  const showRechargeTimer = limit > 0 && !hasRemainingScans && !!nextRechargeAt;


  return (
    <View style={styles.container}>
      {hasRemainingScans ? (
        <View style={styles.countContainer}>
          {/* Affiche les scans DISPONIBLES / limite totale */}
          <Text style={[styles.countText, isLimitReached && styles.countTextDisabled]}>
            {remaining}
          </Text>
          <Text style={styles.countSeparator}>/</Text>
          <Text style={styles.limitText}>{limit}</Text>
        </View>
      ) : null}

      <View style={styles.progressContainer}>
        <Squircle style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
              isLimitReached && styles.progressFillDisabled,
            ]}
          />
        </Squircle>
      </View>

      {showRechargeTimer ? (
        <View style={styles.statusTimerContainer}>
          <NextScanTimer
            nextAvailableDate={nextRechargeAt}
            scanLabel={t('scan_limit.next_scan_in')}
            textColor={colors.gray}
            iconColor={colors.gray}
            mode="scannerCompact"
            serverClockOffsetMs={eligibility.server_clock_offset_ms}
            padHours
            onTimerComplete={onTimerComplete}
          />
        </View>
      ) : isLimitReached && onLimitReachedPress ? (
        <TouchableOpacity onPress={onLimitReachedPress} activeOpacity={0.7} style={styles.statusButton}>
          <Text
            style={[styles.statusText, { color: colors.primary, textDecorationLine: 'underline' }]}
            numberOfLines={1}
          >
            {t('scan_limit.upgrade')}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.statusText, isLimitReached && styles.statusTextDisabled]} numberOfLines={1}>
          {isLimitReached ? t('scan_limit.limit_reached') : t('scan_limit.available')}
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    alignItems: 'stretch',
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  countText: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  countTextDisabled: {
    color: colors.gray,
  },
  countSeparator: {
    fontSize: SIZES.text14,
    color: colors.grayMedium,
    marginHorizontal: 2,
  },
  limitText: {
    fontSize: SIZES.text14,
    color: colors.gray,
    fontWeight: FONT_WEIGHTS.medium,
  },
  progressContainer: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: SPACING.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.lightGray,
    borderRadius: 2,
    overflow: 'hidden', borderCurve: 'continuous',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2, borderCurve: 'continuous',
  },
  progressFillDisabled: {
    backgroundColor: colors.grayMedium,
  },
  statusText: {
    fontSize: SIZES.text12,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'center',
    flexShrink: 1,
  },
  statusTextDisabled: {
    color: colors.gray,
  },
  statusButton: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  statusTimerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
  },
});
