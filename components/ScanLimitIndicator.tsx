import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gift } from 'lucide-react-native';
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
  isPremium,
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

  // Crédits "welcome" : bonus gratuits offerts à l'inscription. Affichés en
  // parité avec le Scanner (badge Gift vert) pour que l'utilisateur sache
  // qu'il a des scans gratuits supplémentaires en plus du quota régulier.
  const welcomeCredits =
    typeof eligibility.welcome_credits === 'number'
      ? Math.max(0, eligibility.welcome_credits)
      : typeof eligibility.remaining_welcome_credits === 'number'
        ? Math.max(0, eligibility.remaining_welcome_credits)
        : 0;
  const showWelcomeBadge = welcomeCredits > 0 && !isPremium;


  return (
    <View style={styles.container}>
      {/*
       * Compteur "remaining/limit" affiché EN PERMANENCE.
       * Auparavant masqué quand le quota était épuisé, ce qui rendait l'état
       * "0/1 + cooldown" illisible (audit 2026-05). Maintenant on le garde
       * en muet quand isLimitReached pour que l'utilisateur voie clairement
       * "0/1" + le timer en-dessous.
       */}
      <View style={styles.countContainer} testID="scan-limit-count">
        <Text
          style={[styles.countText, isLimitReached && styles.countTextDisabled]}
          testID="scan-limit-remaining"
        >
          {remaining}
        </Text>
        <Text style={styles.countSeparator}>/</Text>
        <Text style={styles.limitText}>{limit}</Text>
      </View>

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

      {showWelcomeBadge ? (
        <View style={styles.welcomeBadge} testID="scan-limit-welcome">
          <Gift color={colors.success} size={10} strokeWidth={2} />
          <Text style={styles.welcomeBadgeText}>+{welcomeCredits}</Text>
        </View>
      ) : null}

      {showRechargeTimer ? (
        <View style={styles.statusTimerContainer} testID="scan-limit-cooldown">
          <NextScanTimer
            nextAvailableDate={nextRechargeAt}
            scanLabel={t('scan_limit.next_scan_in')}
            textColor={colors.gray}
            iconColor={colors.gray}
            mode="homeCompact"
            serverClockOffsetMs={eligibility.server_clock_offset_ms}
            padHours
            onTimerComplete={onTimerComplete}
          />
        </View>
      ) : isLimitReached && onLimitReachedPress ? (
        <TouchableOpacity
          onPress={onLimitReachedPress}
          activeOpacity={0.7}
          style={styles.statusButton}
          testID="scan-limit-upgrade"
        >
          <Text
            style={[styles.statusText, { color: colors.primary, textDecorationLine: 'underline' }]}
            numberOfLines={2}
          >
            {t('scan_limit.upgrade')}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text
          style={[styles.statusText, isLimitReached && styles.statusTextDisabled]}
          numberOfLines={2}
          testID="scan-limit-status"
        >
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
  welcomeBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    marginBottom: SPACING.xs,
  },
  welcomeBadgeText: {
    fontSize: SIZES.text10,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.success,
  },
});
