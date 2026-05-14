import { useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChefHat, ChevronRight, Crown } from 'lucide-react-native';

import {
  buildPremiumHealthModulePalette,
  getPremiumHealthResponsiveCardMetrics,
} from '@/constants/premiumHealth';
import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

const CHEF_HOME_GROUP_IMAGE = require('../../assets/images/chef/chef-home-group.webp');

type ChefHomeCardProps = {
  onPress: () => void;
};

function getChefPalette(colors: any, isDark: boolean) {
  return buildPremiumHealthModulePalette(colors, isDark, 'premium');
}

export function ChefHomeCard({ onPress }: ChefHomeCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const metrics = useMemo(
    () => getPremiumHealthResponsiveCardMetrics(windowWidth),
    [windowWidth],
  );
  const palette = useMemo(
    () => getChefPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, metrics, palette),
    [colors, isDark, metrics, palette],
  );

  return (
    <TouchableOpacity
      accessibilityLabel={t('home.fridge_scan.cta')}
      accessibilityRole="button"
      activeOpacity={0.94}
      onPress={onPress}
      style={styles.shell}
      testID="home-fridge-scan-card"
    >
      <View style={styles.surface} testID="home-fridge-scan-surface">
        <LinearGradient
          colors={palette.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
        />
        <LinearGradient
          colors={palette.bottomScrimGradient}
          start={{ x: 0.5, y: 0.42 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.bottomScrim}
        />
        <LinearGradient
          colors={palette.copyScrimGradient}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 1, y: 0.35 }}
          style={styles.copyScrim}
        />

        <View
          pointerEvents="none"
          style={styles.visualStage}
          testID="home-chef-group"
        >
          <LinearGradient
            colors={palette.spotlightGradient}
            start={{ x: 0.12, y: 0.08 }}
            end={{ x: 0.92, y: 0.92 }}
            style={styles.visualGlow}
          />
          <Image
            source={CHEF_HOME_GROUP_IMAGE}
            resizeMode="contain"
            style={styles.chefGroupImage}
            testID="home-chef-group-image"
          />
        </View>

        <View style={styles.content}>
          <View style={styles.copyColumn}>
            <View style={styles.eyebrowPill}>
              <Crown
                color={palette.eyebrowText}
                fill={palette.eyebrowText}
                size={16}
                strokeWidth={2.2}
              />
              <Text style={styles.eyebrow}>
                {t('home.fridge_scan.eyebrow')}
              </Text>
            </View>

            <Text style={styles.title}>{t('home.fridge_scan.title')}</Text>
            <Text style={styles.subtitle}>{t('home.fridge_scan.body')}</Text>

            <View style={styles.metaPanel} testID="home-fridge-scan-quota">
              <View style={styles.metaIconTile}>
                <ChefHat
                  color={palette.accent}
                  size={18}
                  strokeWidth={2.3}
                />
              </View>
              <View style={styles.metaTextColumn}>
                <Text style={styles.metaPrimary}>
                  {t('home.fridge_scan.limit_primary')}
                </Text>
                <Text style={styles.metaSecondary}>
                  {t('home.fridge_scan.limit_secondary')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.cta} testID="home-fridge-scan-cta">
              <Text style={styles.ctaText}>{t('home.fridge_scan.cta')}</Text>
              <ChevronRight
                color={palette.ctaIcon}
                size={22}
                strokeWidth={2.7}
              />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (
  _colors: any,
  isDark: boolean,
  metrics: ReturnType<typeof getPremiumHealthResponsiveCardMetrics>,
  palette: ReturnType<typeof getChefPalette>,
) => {
  const visualStageHeight = metrics.isTablet ? 286 : metrics.isCompact ? 226 : 254;
  const visualStageWidth = metrics.isTablet ? 272 : metrics.isCompact ? 204 : 232;
  const imageWidth = metrics.isTablet ? 298 : metrics.isCompact ? 232 : 260;
  const imageHeight = metrics.isTablet ? 298 : metrics.isCompact ? 232 : 260;
  const footerHeight = metrics.ctaHeight + SPACING.md;

  return StyleSheet.create({
    shell: {
      borderRadius: metrics.cardRadius,
      shadowColor: palette.shellShadowColor,
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: isDark ? 18 : 14,
      shadowOffset: { width: 0, height: isDark ? 11 : 9 },
      elevation: 6,
    },
    surface: {
      minHeight: metrics.cardMinHeight,
      borderRadius: metrics.cardRadius,
      padding: metrics.horizontalPadding,
      overflow: 'hidden',
      backgroundColor: palette.surfaceBackground,
      borderWidth: 1,
      borderColor: palette.surfaceBorder,
      position: 'relative',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '44%',
      zIndex: 2,
    },
    copyScrim: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: Math.min(
        metrics.copyWidth + metrics.horizontalPadding * 2 + 12,
        360,
      ),
      zIndex: 1,
    },
    visualStage: {
      position: 'absolute',
      width: visualStageWidth,
      height: visualStageHeight,
      right: metrics.isTablet ? 16 : metrics.isCompact ? -28 : -18,
      top: metrics.isTablet ? 64 : metrics.isCompact ? 98 : 96,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    visualGlow: {
      position: 'absolute',
      inset: 20,
      borderRadius: 999,
      opacity: isDark ? 0.36 : 0.42,
    },
    chefGroupImage: {
      width: imageWidth,
      height: imageHeight,
      opacity: palette.imageOpacity,
      shadowColor: palette.imageShadowColor,
      shadowOpacity: palette.imageShadowOpacity,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
    },
    content: {
      minHeight: metrics.cardMinHeight - metrics.horizontalPadding * 2,
      position: 'relative',
      zIndex: 3,
    },
    copyColumn: {
      width: metrics.copyWidth,
      alignItems: 'flex-start',
      zIndex: 4,
    },
    eyebrowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.eyebrowBackground,
      borderWidth: 1,
      borderColor: palette.eyebrowBorder,
    },
    eyebrow: {
      color: palette.eyebrowText,
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.45,
      textTransform: 'uppercase',
      fontFamily: FONT_FAMILIES.display,
    },
    title: {
      marginTop: SPACING.lg,
      color: palette.title,
      fontSize: metrics.titleSize,
      lineHeight: metrics.titleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.display,
    },
    subtitle: {
      marginTop: SPACING.sm,
      color: palette.body,
      fontSize: metrics.bodySize,
      lineHeight: metrics.bodyLineHeight,
      fontWeight: FONT_WEIGHTS.medium,
    },
    metaPanel: {
      marginTop: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: palette.metaPanelBackground,
      borderWidth: 1,
      borderColor: palette.metaPanelBorder,
      maxWidth: metrics.copyWidth,
    },
    metaIconTile: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: palette.metaIconTileBackground,
      borderWidth: 1,
      borderColor: palette.metaIconTileBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaTextColumn: {
      flexShrink: 1,
    },
    metaPrimary: {
      color: palette.metaPrimaryText,
      fontSize: metrics.metaPrimarySize,
      lineHeight: metrics.metaPrimarySize + 4,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.display,
    },
    metaSecondary: {
      marginTop: 2,
      color: palette.metaSecondaryText,
      fontSize: metrics.metaSecondarySize,
      lineHeight: metrics.metaSecondarySize + 4,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.2,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      paddingTop: SPACING.md,
      minHeight: footerHeight,
      zIndex: 5,
    },
    cta: {
      minHeight: metrics.ctaHeight,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.ctaBackground,
      borderWidth: 1,
      borderColor: palette.ctaBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      gap: SPACING.md,
      ...SHADOWS.button,
      shadowColor: palette.ctaShadowColor,
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: isDark ? 10 : 8,
      shadowOffset: { width: 0, height: isDark ? 6 : 4 },
    },
    ctaText: {
      color: palette.ctaText,
      fontSize: metrics.isCompact ? SIZES.text16 : SIZES.text18,
      lineHeight: metrics.isCompact ? 22 : 24,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.display,
    },
  });
};
