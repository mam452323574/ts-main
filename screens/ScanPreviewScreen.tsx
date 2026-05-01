import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  X,
  Activity,
  Utensils,
  PersonStanding,
  Smile,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ApiService, ApiError, ApiErrorType } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { SuccessConfetti } from '@/components/SuccessConfetti';
import { useBadges } from '@/contexts/BadgeContext';
import { useGamification } from '@/contexts/GamificationContext';
import { ScanType } from '@/types';
import { SCAN_PREVIEW_MIN_LOADING_MS, SCAN_TYPE_LABELS } from '@/constants/scan';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { primeCoachScansCache } from '@/utils/coachScanQueries';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';
import { logExpectedFailure, logOperationalError } from '@/utils/observability';
import { invalidateScanRelatedQueries } from '@/utils/scanRelatedQueries';
import {
  resolveScanFlowAccentTheme,
  resolveScanPreviewVisualTheme,
} from '@/utils/scanFlowVisualTheme';

// Erreurs business attendues (quota, mismatch, session) → log warn au lieu d'error
// pour ne pas polluer la console dev avec des stack traces sur du flow normal.
const EXPECTED_SCAN_ERROR_TYPES: ReadonlySet<ApiErrorType> = new Set([
  'VALIDATION',
  'TYPE_MISMATCH',
  'AUTH',
]);

// Loading step messages for different languages and scan types (with emojis)
const LOADING_STEPS: Record<string, Record<ScanType, string[]>> = {
  fr: {
    health: [
      '🔍 Scan du visage...',
      '🧬 Analyse de la peau...',
      '📐 Détection des symétries...',
      '✨ Finalisation du score...',
    ],
    body: [
      '📸 Scan de la silhouette...',
      '⚖️ Estimation de la masse...',
      '🧘 Analyse de la posture...',
      '📊 Calcul des indicateurs...',
    ],
    nutrition: [
      '🍽️ Reconnaissance du plat...',
      '🔥 Estimation calorique...',
      '🥗 Analyse des nutriments...',
      '⭐ Score nutritionnel...',
    ],
    super: [
      '🚀 Scan complet initié...',
      '🤖 Analyse croisée IA...',
      '🧠 Détection biométrique...',
      '🎯 Synthèse globale...',
    ],
  },
  en: {
    health: [
      '🔍 Scanning face...',
      '🧬 Analyzing skin...',
      '📐 Detecting symmetry...',
      '✨ Finalizing score...',
    ],
    body: [
      '📸 Scanning body shape...',
      '⚖️ Estimating mass...',
      '🧘 Analyzing posture...',
      '📊 Calculating metrics...',
    ],
    nutrition: [
      '🍽️ Identifying dish...',
      '🔥 Estimating calories...',
      '🥗 Analyzing nutrients...',
      '⭐ Nutrition score...',
    ],
    super: [
      '🚀 Full scan initiated...',
      '🤖 Cross-referencing AI...',
      '🧠 Biometric detection...',
      '🎯 Global synthesis...',
    ],
  },
  de: {
    health: [
      '🔍 Gesichtsscan...',
      '🧬 Hautanalyse...',
      '📐 Symmetrieerkennung...',
      '✨ Punkteberechnung...',
    ],
    body: [
      '📸 Körperscan...',
      '⚖️ Masseschätzung...',
      '🧘 Haltungsanalyse...',
      '📊 Kennzahlen berechnen...',
    ],
    nutrition: [
      '🍽️ Gericht erkennen...',
      '🔥 Kalorienschätzung...',
      '🥗 Nährstoffanalyse...',
      '⭐ Ernährungswert...',
    ],
    super: [
      '🚀 Vollständiger Scan...',
      '🤖 KI-Kreuzanalyse...',
      '🧠 Biometrische Erkennung...',
      '🎯 Gesamtauswertung...',
    ],
  },
  es: {
    health: [
      '🔍 Escaneando rostro...',
      '🧬 Análisis de piel...',
      '📐 Detectando simetría...',
      '✨ Finalizando puntuación...',
    ],
    body: [
      '📸 Escaneando cuerpo...',
      '⚖️ Estimación de masa...',
      '🧘 Análisis de postura...',
      '📊 Calculando métricas...',
    ],
    nutrition: [
      '🍽️ Identificando plato...',
      '🔥 Estimación calórica...',
      '🥗 Análisis de nutrientes...',
      '⭐ Puntuación nutricional...',
    ],
    super: [
      '🚀 Escaneo completo...',
      '🤖 Análisis IA cruzado...',
      '🧠 Detección biométrica...',
      '🎯 Síntesis global...',
    ],
  },
  it: {
    health: [
      '🔍 Scansione volto...',
      '🧬 Analisi della pelle...',
      '📐 Rilevamento simmetria...',
      '✨ Calcolo punteggio...',
    ],
    body: [
      '📸 Scansione corpo...',
      '⚖️ Stima della massa...',
      '🧘 Analisi postura...',
      '📊 Calcolo metriche...',
    ],
    nutrition: [
      '🍽️ Identificazione piatto...',
      '🔥 Stima calorie...',
      '🥗 Analisi nutrienti...',
      '⭐ Punteggio nutrizionale...',
    ],
    super: [
      '🚀 Scansione completa...',
      '🤖 Analisi IA incrociata...',
      '🧠 Rilevamento biometrico...',
      '🎯 Sintesi globale...',
    ],
  },
  pt: {
    health: [
      '🔍 Escanear rosto...',
      '🧬 Análise da pele...',
      '📐 Detecção de simetria...',
      '✨ Finalizando pontuação...',
    ],
    body: [
      '📸 Escanear corpo...',
      '⚖️ Estimativa de massa...',
      '🧘 Análise de postura...',
      '📊 Calculando métricas...',
    ],
    nutrition: [
      '🍽️ Identificando prato...',
      '🔥 Estimativa calórica...',
      '🥗 Análise de nutrientes...',
      '⭐ Pontuação nutricional...',
    ],
    super: [
      '🚀 Escaneamento completo...',
      '🤖 Análise cruzada de IA...',
      '🧠 Detecção biométrica...',
      '🎯 Síntese global...',
    ],
  },
};

const VALID_SCAN_TYPES: ScanType[] = ['body', 'health', 'nutrition', 'super'];

export default function ScanPreviewScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const imageUri = params.imageUri as string;
  const scanType = params.scanType as ScanType;

  const [loading, setLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const { showAlert, alertElement } = useCustomAlert();
  const { setBadge } = useBadges();
  const { incrementScanCount } = useGamification();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompactAndroidLayout =
    Platform.OS === 'android' && windowHeight < 760;
  const previewTheme = useMemo(
    () => resolveScanPreviewVisualTheme(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(insets, isCompactAndroidLayout, previewTheme),
    [insets, isCompactAndroidLayout, previewTheme]
  );
  const accentTheme = useMemo(
    () => resolveScanFlowAccentTheme(colors, isDark, scanType ?? 'health'),
    [colors, isDark, scanType],
  );

  // Simulated progress state
  const [currentStep, setCurrentStep] = useState(0);
  const [isApiComplete, setIsApiComplete] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get loading steps based on language (default to English) and scan type
  const stepsForLocale =
    LOADING_STEPS[locale as keyof typeof LOADING_STEPS] || LOADING_STEPS.en;
  const loadingSteps = stepsForLocale[scanType] || stepsForLocale.health; // Fallback to health if type missing

  // Listen to progress animation changes
  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      setDisplayProgress(Math.round(value));
    });
    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  // Validation des parametres requis
  useEffect(() => {
    if (!imageUri || !scanType || !VALID_SCAN_TYPES.includes(scanType)) {
      showAlert(t('common.error'), t('scan_preview.error_validation'), [
        {
          text: t('common.ok'),
          onPress: () => router.back(),
        },
      ]);
    }
  }, [imageUri, scanType, router]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
    };
  }, []);

  // Simulated progress animation effect
  useEffect(() => {
    if (loading && !isApiComplete) {
      // Reset progress when loading starts
      progressAnim.setValue(0);
      setCurrentStep(0);

      // Animate progress from 0 to 90% over 25 seconds for realism
      Animated.timing(progressAnim, {
        toValue: 90,
        duration: 25000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      // Cycle through steps every 1.2 seconds
      stepIntervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = (prev + 1) % loadingSteps.length;
          return nextStep;
        });
      }, 1200);
    } else if (isApiComplete) {
      // API completed - animate to 100%
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
      setCurrentStep(loadingSteps.length - 1); // Set to final step

      Animated.timing(progressAnim, {
        toValue: 100,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    }

    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
    };
  }, [loading, isApiComplete, loadingSteps.length]);

  const getResolvedApiErrorMessage = useCallback((error: ApiError, fallback: string) => {
    if (error.message.startsWith('api_errors.')) {
      return t(error.message);
    }

    return error.message || fallback;
  }, [t]);

  const resolveScanErrorAlert = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      switch (error.type) {
        case 'TYPE_MISMATCH':
          return {
            title: t('scan_preview.error_title_type'),
            message: getResolvedApiErrorMessage(
              error,
              t('scan_preview.error_msg_type'),
            ),
          };
        case 'AUTH':
          return {
            title: t('scan_preview.error_title_session'),
            message: t('scan_preview.error_msg_session'),
          };
        case 'NETWORK':
          return {
            title: t('scan_preview.error_title_network'),
            message: t('scan_preview.error_msg_network'),
          };
        case 'TIMEOUT':
          return {
            title: t('scan_preview.error_title_timeout'),
            message: t('scan_preview.error_msg_timeout'),
          };
        case 'UPLOAD':
          return {
            title: t('scan_preview.error_title_upload'),
            message: t('scan_preview.error_msg_upload'),
          };
        case 'PROVIDER':
          return {
            title: t('scan_preview.error_title_provider'),
            message: t('scan_preview.error_msg_provider'),
          };
        case 'DATABASE':
        case 'EDGE_FUNCTION':
          return {
            title: t('scan_preview.error_title_server'),
            message: t('scan_preview.error_msg_server'),
          };
        case 'VALIDATION':
          return {
            title: t('common.error'),
            message: getResolvedApiErrorMessage(
              error,
              t('scan_preview.error_validation'),
            ),
          };
        case 'ANALYSIS':
        case 'UNKNOWN':
        default:
          return {
            title: t('scan_preview.error_title_analysis'),
            message: getResolvedApiErrorMessage(
              error,
              t('scan_preview.error_msg_default'),
            ),
          };
      }
    }

    if (error instanceof Error) {
      return {
        title: t('common.error'),
        message: error.message || t('common.error'),
      };
    }

    return {
      title: t('common.error'),
      message: t('common.error'),
    };
  }, [getResolvedApiErrorMessage, t]);

  const showScanErrorAlert = useCallback((error: unknown) => {
    const resolvedError = error instanceof ApiError ? error : undefined;
    const logFn =
      resolvedError && EXPECTED_SCAN_ERROR_TYPES.has(resolvedError.type)
        ? logExpectedFailure
        : logOperationalError;

    logFn('[ScanPreviewScreen] Scan flow failed', error, {
      scan_type: scanType,
      error_type: resolvedError?.type,
      error_code: resolvedError?.code,
      error_status: resolvedError?.status,
      request_id: resolvedError?.requestId,
    });

    const { title, message } = resolveScanErrorAlert(error);
    showAlert(title, message, [
      {
        text: t('common.retry'),
        onPress: () => {
          void handleConfirm();
        },
      },
      {
        text: t('common.back'),
        style: 'cancel',
        onPress: () => router.back(),
      },
    ]);
  }, [resolveScanErrorAlert, router, scanType, showAlert, t, handleConfirm]);

  async function handleConfirm() {
    // Protection contre les doubles clics
    if (loading) return;

    try {
      setLoading(true);
      setIsApiComplete(false);
      const minimumLoadingMs = SCAN_PREVIEW_MIN_LOADING_MS[scanType];

      // Force a minimum loading time tailored to the scan type to keep the UI aligned
      // with the perceived analysis duration without affecting the backend flow.
      const [result] = await Promise.all([
        ApiService.createScanWithAnalysis(imageUri, scanType, locale),
        new Promise((resolve) => setTimeout(resolve, minimumLoadingMs)),
      ]);

      // Vérifier si l'analyse a réussi
      if (result.analysisSucceeded && result.scan.analysis_result) {
        // Succès - afficher confetti et naviguer vers les résultats
        // NOTE: On ne met PAS setLoading(false) ici pour empêcher les doubles clics
        // pendant l'animation et avant la navigation

        try {
          await incrementScanCount();
        } catch (error) {
          console.error(
            '[ScanPreviewScreen] Error incrementing local gamification count:',
            error
          );
        }

        primeCoachScansCache(queryClient, result.scan);
        await invalidateScanRelatedQueries(queryClient);

        // Mark API as complete to trigger 100% progress
        setIsApiComplete(true);

        // Small delay to show 100% progress before confetti
        await new Promise((resolve) => setTimeout(resolve, 300));

        setShowConfetti(true);
        setBadge('coach');

        timeoutRef.current = setTimeout(() => {
          // Router vers l'écran approprié selon le type de scan
          const targetPath =
            scanType === 'super' ? '/super-scan-result' : '/scan-result';
          router.replace({
            pathname: targetPath,
            params: {
              analysisData: JSON.stringify(result.scan.analysis_result),
              imageUri,
              ...(result.scan?.id ? { scanId: String(result.scan.id) } : {}),
            },
          });
          // La navigation va démonter le composant, pas besoin de reset loading
        }, 1500);
      } else {
        // Échec de l'analyse - afficher le message d'erreur approprié
        setLoading(false); // On réactive le bouton pour permettre de réessayer
        showScanErrorAlert(result.analysisError);
      }
    } catch (err) {
      setLoading(false);
      showScanErrorAlert(err);
    }
  }

  return (
    <View
      style={[styles.container, { backgroundColor: previewTheme.screenBackground }]}
    >
      {alertElement}
      <SuccessConfetti
        active={showConfetti}
        onAnimationEnd={() => setShowConfetti(false)}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          testID="scan-preview-close-button"
        >
          <X
            color={previewTheme.closeButtonIcon}
            size={20}
            strokeWidth={2.5}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer} testID="scan-preview-image-container">
        <Image source={{ uri: imageUri }} style={styles.image} />
      </View>

      <BlurView
        intensity={80}
        tint={previewTheme.actionPanelTint}
        style={styles.blurContainer}
        testID="scan-preview-action-panel"
      >
        <View style={styles.buttonsContent}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t('scan_preview.type_label')}</Text>
            <Text style={styles.infoValue}>
              {t(SCAN_TYPE_LABELS[scanType])}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={handleConfirm}
            disabled={loading}
            testID="confirm-button"
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? t('scan_preview.confirm_loading')
                : t('scan_preview.confirm_button')}
            </Text>
          </TouchableOpacity>

          {!loading && (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </BlurView>

      {loading && (
        <View style={styles.loadingOverlay} testID="scan-preview-loading-overlay">
          <View style={styles.progressContainer} testID="scan-preview-progress-card">
            {/* Dynamic Icon */}
            <View
              style={[
                styles.iconContainer,
                {
                  borderColor: accentTheme.accentColor,
                  backgroundColor: accentTheme.accentSoftBackground,
                },
              ]}
            >
              {scanType === 'super' ? (
                <SuperScanFeatureIcon color={accentTheme.accentColor} size={32} />
              ) : scanType === 'health' ? (
                <Smile color={accentTheme.accentColor} size={32} />
              ) : scanType === 'body' ? (
                <PersonStanding color={accentTheme.accentColor} size={32} />
              ) : (
                <Utensils color={accentTheme.accentColor} size={32} />
              )}
            </View>

            {/* Current Step Text - Main headline */}
            <Text style={styles.loadingStepText}>
              {loadingSteps[currentStep]}
            </Text>

            {/* Progress Bar with Gradient */}
            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBarBackground}>
                <Animated.View
                  style={[
                    styles.progressBarFillContainer,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={accentTheme.progressGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.progressBarGradient}
                  />
                </Animated.View>
              </View>

              {/* Percentage Badge */}
              <View
                style={[
                  styles.percentageBadge,
                  {
                    backgroundColor: accentTheme.accentBadgeBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.progressPercentage,
                    {
                      color: accentTheme.accentColor,
                    },
                  ]}
                >
                  {displayProgress}%
                </Text>
              </View>
            </View>

            {/* Subtitle / Hint */}
            <Text style={styles.loadingSubtext}>
              {t('scan_preview.loading_text')}
            </Text>

            {/* Progress dots indicator */}
            <View style={styles.dotsContainer}>
              {loadingSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === currentStep && styles.dotActive,
                    index < currentStep && styles.dotCompleted,
                    index === currentStep
                      ? { backgroundColor: accentTheme.dotActiveColor }
                      : null,
                    index < currentStep
                      ? { backgroundColor: accentTheme.dotCompletedColor }
                      : null,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (
  insets: { top: number; bottom: number },
  isCompactAndroidLayout: boolean,
  previewTheme: ReturnType<typeof resolveScanPreviewVisualTheme>,
) => {
  const safeBottomInset = getMinimumBottomInsetPadding(insets.bottom, SPACING.sm);
  const imageBottomReserve = safeBottomInset + (isCompactAndroidLayout ? 236 : 280);
  const imageTopPadding = insets.top + (isCompactAndroidLayout ? 60 : 72);
  const loadingTopPadding = insets.top + (isCompactAndroidLayout ? 72 : 96);

  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.xl,
      zIndex: 10,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: previewTheme.closeButtonBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: previewTheme.closeButtonBorder,
    },
    headerTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
    },
    imageContainer: {
      flex: 1,
      paddingHorizontal: 20, // Slightly reduced to increase image width
      paddingTop: imageTopPadding,
      paddingBottom: imageBottomReserve,
    },
    image: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      overflow: 'hidden',
      resizeMode: 'cover',
    },
    blurContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      overflow: 'hidden',
      backgroundColor: previewTheme.actionPanelBackground,
      shadowColor: previewTheme.actionPanelShadowColor,
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 6,
    },
    buttonsContent: {
      paddingHorizontal: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      paddingTop: isCompactAndroidLayout ? SPACING.xl : SPACING.xxl,
      paddingBottom: safeBottomInset + SPACING.lg,
    },
    infoCard: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    infoLabel: {
      fontSize: 13,
      color: previewTheme.infoLabelColor,
      fontWeight: '400',
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 24,
      fontWeight: '700',
      color: previewTheme.infoValueColor,
      letterSpacing: 0.5,
    },
    actionButton: {
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    primaryButton: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: SIZES.text16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: previewTheme.secondaryButtonBackground,
    },
    secondaryButtonText: {
      color: previewTheme.secondaryButtonText,
      fontSize: SIZES.text16,
      fontWeight: '500',
    },
    // Premium Loading Overlay Styles
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: previewTheme.loadingOverlayBackground,
      justifyContent: 'flex-start',
      paddingTop: loadingTopPadding,
      alignItems: 'center',
      zIndex: 999,
    },
    progressContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      width: '92%',
      minHeight: isCompactAndroidLayout ? 368 : 420,
      backgroundColor: previewTheme.progressCardBackground,
      borderRadius: 36,
      paddingVertical: isCompactAndroidLayout ? 40 : 56,
      paddingHorizontal: isCompactAndroidLayout ? 24 : 32,
      borderWidth: 1,
      borderColor: previewTheme.progressCardBorder,
      overflow: 'hidden',
      shadowColor: previewTheme.progressCardShadowColor,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.18,
      shadowRadius: 32,
      elevation: 30,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 32,
      borderWidth: 1.5,
    },
    loadingStepText: {
      fontSize: 22,
      fontWeight: '700',
      color: previewTheme.loadingStepText,
      textAlign: 'center',
      marginBottom: 32,
      letterSpacing: 0.3,
    },
    progressBarWrapper: {
      width: '100%',
      marginBottom: 24,
    },
    progressBarBackground: {
      width: '100%',
      height: 14,
      backgroundColor: previewTheme.progressTrackBackground,
      borderRadius: 7,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: previewTheme.progressTrackBorder,
    },
    progressBarFillContainer: {
      height: '100%',
      borderRadius: 7,
      overflow: 'hidden',
    },
    progressBarGradient: {
      flex: 1,
      borderRadius: 7,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#667eea',
      borderRadius: 7,
    },
    percentageBadge: {
      alignSelf: 'flex-end',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      marginTop: 16,
    },
    progressPercentage: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    loadingSubtext: {
      fontSize: 14,
      color: previewTheme.loadingSubtext,
      textAlign: 'center',
      paddingHorizontal: 24,
      marginBottom: 24,
      lineHeight: 20,
    },
    loadingText: {
      marginTop: SPACING.lg,
      fontSize: SIZES.text16,
      textAlign: 'center',
      paddingHorizontal: SPACING.xl,
      fontWeight: FONT_WEIGHTS.medium,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: previewTheme.dotBackground,
    },
    dotActive: {
      width: 24,
    },
    dotCompleted: {
    },
  });
};
