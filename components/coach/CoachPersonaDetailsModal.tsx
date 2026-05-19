import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Lock, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ModalHandle } from '@/components/ModalHandle';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachPersonaDefinition } from '@/shared/coachPersonas';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { Squircle } from '@/components/Squircle';

interface CoachPersonaDetailsModalProps {
  visible: boolean;
  persona: CoachPersonaDefinition | null;
  visual: CoachPersonaVisual | null;
  active: boolean;
  locked: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUnlock: () => void;
}

export function CoachPersonaDetailsModal({
  visible,
  persona,
  visual,
  active,
  locked,
  loading = false,
  onClose,
  onConfirm,
  onUnlock,
}: CoachPersonaDetailsModalProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const viewportHeight = windowHeight || 720;
  const footerBottomPadding = Math.max(insets.bottom, SPACING.md);
  const styles = useMemo(
    () => createStyles(colors, footerBottomPadding),
    [colors, footerBottomPadding],
  );
  const sheetMaxHeight = Math.min(
    viewportHeight * 0.9,
    Math.max(280, viewportHeight - insets.top - SPACING.md),
  );

  const sections = useMemo(
    () =>
      persona
        ? [
            {
              key: 'voice',
              label: t('coach.persona_detail_voice_label'),
              value: t(persona.voiceTranslationKey),
            },
            {
              key: 'energy',
              label: t('coach.persona_detail_energy_label'),
              value: t(persona.energyTranslationKey),
            },
            {
              key: 'motivation',
              label: t('coach.persona_detail_motivation_label'),
              value: t(persona.motivationTranslationKey),
            },
            {
              key: 'best-for',
              label: t('coach.persona_detail_best_for_label'),
              value: t(persona.bestForTranslationKey),
            },
          ]
        : [],
    [persona, t],
  );

  const primaryCtaLabel = active
    ? t('coach.persona_current_cta')
    : locked
      ? t('coach.persona_unlock_cta')
      : t('coach.persona_choose_cta');
  const secondaryCtaLabel = locked ? t('common.later') : t('common.cancel');

  const handlePrimaryPress = () => {
    if (active) {
      onClose();
      return;
    }

    if (locked) {
      onUnlock();
      return;
    }

    onConfirm();
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible && !!persona && !!visual}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={onClose}
          style={styles.backdrop}
          testID="coach-persona-details-backdrop"
        />

        <Squircle
          style={[styles.sheet, { maxHeight: sheetMaxHeight }]}
          testID="coach-persona-details-modal"
        >
          <View style={styles.sheetHeader}>
            <View pointerEvents="none" style={styles.handleWrap}>
              <ModalHandle />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeIconButton,
                pressed && styles.closeIconButtonPressed,
              ]}
              testID="coach-persona-details-close-x"
            >
              <X color={colors.primaryText} size={20} strokeWidth={2.4} />
            </Pressable>
          </View>

          {persona && visual ? (
            <>
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.scrollView}
                testID="coach-persona-details-scroll"
              >
                <View style={styles.header}>
                  <Text style={styles.eyebrow}>
                    {t('coach.persona_modal_title')}
                  </Text>

                  <View style={styles.heroRow}>
                    <CoachPersonaAvatar
                      imageSource={visual.imageSource}
                      fallbackLabel={visual.fallbackLabel}
                      haloTint={visual.haloTint}
                      emphasis="featured"
                      size={84}
                      testID="coach-persona-details-avatar"
                    />

                    <View style={styles.heroCopy}>
                      <View style={styles.badgeRow}>
                        <View style={styles.toneBadge}>
                          <Text style={styles.toneBadgeLabel}>
                            {t(persona.toneBadgeTranslationKey)}
                          </Text>
                        </View>
                        {active ? (
                          <View style={styles.statusBadge}>
                            <Text style={styles.statusBadgeLabel}>
                              {t('coach.persona_current_badge')}
                            </Text>
                          </View>
                        ) : null}
                        {locked ? (
                          <View style={styles.lockedBadge}>
                            <Text style={styles.lockedBadgeLabel}>
                              {t('coach.locked_badge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={styles.title}
                        testID="coach-persona-details-title"
                      >
                        {t(persona.titleTranslationKey)}
                      </Text>
                      <Text
                        style={styles.summary}
                        testID="coach-persona-details-summary"
                      >
                        {t(persona.summaryTranslationKey)}
                      </Text>
                    </View>
                  </View>
                </View>

                {locked ? (
                  <Squircle
                    style={styles.lockedCallout}
                    testID="coach-persona-details-locked-callout"
                  >
                    <Squircle style={styles.lockedCalloutIcon}>
                      <Lock
                        color={colors.gold ?? '#FFD700'}
                        size={16}
                        strokeWidth={2.4}
                      />
                    </Squircle>
                    <View style={styles.lockedCalloutCopy}>
                      <Text style={styles.lockedCalloutTitle}>
                        {t('coach.persona_locked_title')}
                      </Text>
                      <Text style={styles.lockedCalloutBody}>
                        {t('coach.persona_locked_body')}
                      </Text>
                    </View>
                  </Squircle>
                ) : null}

                <View style={styles.sections}>
                  {sections.map((section) => (
                    <Squircle
                      key={section.key}
                      style={styles.detailCard}
                      testID={`coach-persona-details-${section.key}`}
                    >
                      <Text style={styles.detailLabel}>{section.label}</Text>
                      <Text style={styles.detailValue}>{section.value}</Text>
                    </Squircle>
                  ))}
                </View>
              </ScrollView>

              <View
                style={styles.footer}
                testID="coach-persona-details-footer"
              >
                <Button
                  title={primaryCtaLabel}
                  onPress={handlePrimaryPress}
                  loading={loading && !active}
                  testID="coach-persona-details-primary-cta"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={secondaryCtaLabel}
                  onPress={onClose}
                  style={styles.secondaryAction}
                  testID="coach-persona-details-close"
                >
                  <Text style={styles.secondaryActionLabel}>
                    {secondaryCtaLabel}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Squircle>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, footerBottomPadding: number) =>
  StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(colors.primaryText, 0.18),
    },
    sheet: {
      borderTopLeftRadius: BORDER_RADIUS.xl + 10,
      borderTopRightRadius: BORDER_RADIUS.xl + 10,
      backgroundColor: mixColors(colors.cardBackground, colors.primary, 0.04),
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      overflow: 'hidden',
      ...SHADOWS.card, borderCurve: 'continuous',
    },
    sheetHeader: {
      minHeight: 50,
      justifyContent: 'center',
    },
    handleWrap: {
      width: '100%',
    },
    closeIconButton: {
      position: 'absolute',
      top: SPACING.xs,
      right: SPACING.lg,
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    closeIconButtonPressed: {
      opacity: 0.72,
    },
    scrollView: {
      flexShrink: 1,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
      gap: SPACING.lg,
    },
    header: {
      gap: SPACING.md,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    heroCopy: {
      flex: 1,
      gap: SPACING.sm,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
    },
    toneBadge: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primary, 0.16),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.28), borderCurve: 'continuous',
    },
    toneBadgeLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    statusBadge: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.08),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    statusBadgeLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    lockedBadge: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.gold, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold, 0.26), borderCurve: 'continuous',
    },
    lockedBadgeLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.gold,
    },
    lockedCallout: {
      flexDirection: 'row',
      gap: SPACING.sm,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.goldLight ?? '#FFF8E1', 0.16),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold ?? '#FFD700', 0.24), borderCurve: 'continuous',
    },
    lockedCalloutIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.gold ?? '#FFD700', 0.14),
      flexShrink: 0, borderCurve: 'continuous',
    },
    lockedCalloutCopy: {
      flex: 1,
      gap: 3,
    },
    lockedCalloutTitle: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold ?? '#FFD700',
    },
    lockedCalloutBody: {
      fontSize: SIZES.text12,
      lineHeight: 17,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.82),
    },
    title: {
      fontSize: SIZES.text20,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    summary: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: withAlpha(colors.primaryText, 0.86),
    },
    sections: {
      gap: SPACING.sm,
    },
    detailCard: {
      gap: SPACING.xs,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07), borderCurve: 'continuous',
    },
    detailLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.98),
    },
    detailValue: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    footer: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: footerBottomPadding,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
      backgroundColor: mixColors(colors.cardBackground, colors.primary, 0.04),
    },
    secondaryAction: {
      minHeight: 46,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.05),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06), borderCurve: 'continuous',
    },
    secondaryActionLabel: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
  });
