import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { Product } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { OptimizedImage } from '@/components/OptimizedImage';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, SHADOWS } from '@/constants/theme';
import {
  normalizeTrustedHttpsImageUri,
  safeOpenExternalUrl,
  TRUSTED_SHOP_URL_HOSTS,
} from '@/utils/urlSecurity';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safeImageUri = useMemo(
    () => normalizeTrustedHttpsImageUri(product.imageUrl),
    [product.imageUrl],
  );

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void safeOpenExternalUrl(product.shopUrl, {
      allowedHosts: TRUSTED_SHOP_URL_HOSTS,
      context: '[ProductCard] Blocked unsafe product shop URL',
    });
  };

  // Limiter à 3 benefits maximum pour le design native ad
  const displayBenefits = product.benefits.slice(0, 3);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={styles.container}>
        <View style={styles.imageContainer}>
          {safeImageUri ? (
            <OptimizedImage source={{ uri: safeImageUri }} style={styles.image} />
          ) : null}
        </View>
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <View style={styles.benefitsContainer}>
            {displayBenefits.map((benefit, index) => (
              <View key={index} style={styles.benefitRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.benefitText} numberOfLines={1}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.arrowContainer}>
          <ChevronRight color={colors.grayMedium || '#C7C7CC'} size={20} strokeWidth={2} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    ...SHADOWS.card,
  },
  imageContainer: {
    width: 72,
    height: 72,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: colors.grayLight,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
  },
  name: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  benefitsContainer: {
    gap: SPACING.xs,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  benefitText: {
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.regular,
    color: colors.gray,
    flex: 1,
  },
  arrowContainer: {
    paddingLeft: SPACING.sm,
  },
});
