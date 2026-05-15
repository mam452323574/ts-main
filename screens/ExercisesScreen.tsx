import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { useExercises } from '@/hooks/queries/useExercises';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppScreen } from '@/components/AppScreen';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ModalHandle } from '@/components/ModalHandle';
import { OptimizedImage } from '@/components/OptimizedImage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, getMainPageChrome, withAlpha } from '@/constants/theme';

export default function ExercisesScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // React Query hook
  const { data: exercises = [], isLoading, error } = useExercises();

  // Filtrage des exercices avec useMemo pour optimisation
  const filteredExercises = useMemo(() => {
    if (!searchQuery) return exercises;
    return exercises.filter((exercise: any) =>
      exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, exercises]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  const renderExercise = useCallback(
    ({ item }: { item: any }) => (
      <TouchableOpacity style={styles.exerciseCard}>
        <OptimizedImage
          source={{ uri: item.image_url }}
          style={styles.exerciseImage}
          recyclingKey={String(item.id)}
        />
        <View style={styles.exerciseContent}>
          <Text style={styles.exerciseName}>{item.name}</Text>
          <View style={styles.exerciseInfo}>
            <Text style={styles.exerciseDuration}>{item.duration} {t('exercises.duration')}</Text>
            <View
              style={[
                styles.difficultyBadge,
                item.difficulty === 'easy' && styles.difficultyEasy,
                item.difficulty === 'medium' && styles.difficultyMedium,
                item.difficulty === 'hard' && styles.difficultyHard,
              ]}
            >
              <Text style={[styles.difficultyText, { color: getDifficultyTextColor(item.difficulty, colors) }]}>
                {t(`exercises.difficulty.${item.difficulty}`)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    ),
    [colors, styles, t],
  );

  return (
    <AppScreen style={styles.container}>
      <ModalHandle />
      <ScreenHeader
        title={t('exercises.title')}
        variant="inline"
        topInset={false}
        centered
        testID="exercises-screen-header"
      />
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Search color={colors.gray} size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('exercises.search_placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.gray}
          />
        </View>
      </View>

      {filteredExercises.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ScreenState tone="empty" title={t('exercises.no_results')} testID="exercises-empty-state" />
        </View>
      ) : (
        <FlatList
          data={filteredExercises}
          renderItem={renderExercise}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          removeClippedSubviews
          updateCellsBatchingPeriod={80}
          windowSize={5}
        />
      )}
    </AppScreen>
  );
}

const getDifficultyTextColor = (difficulty: string, colors: any) => {
  switch (difficulty) {
    case 'easy':
      return colors.success;
    case 'medium':
      return colors.warning;
    case 'hard':
      return colors.error;
    default:
      return colors.gray;
  }
};

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  ...(() => {
    const chrome = getMainPageChrome(colors, isDark, 'fitness');

    return {
      container: {
        flex: 1,
        backgroundColor: chrome.canvas,
      },
      searchSection: {
        paddingHorizontal: SPACING.page,
        paddingBottom: SPACING.md,
        backgroundColor: chrome.canvas,
        borderBottomWidth: 1,
        borderBottomColor: chrome.headerBorder,
      },
      searchContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        backgroundColor: chrome.mutedSurface.backgroundColor,
        borderRadius: BORDER_RADIUS.full,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderWidth: 1,
        borderColor: chrome.mutedSurface.borderColor,
        ...chrome.mutedSurface.shadowStyle,
      },
      list: {
        padding: SPACING.page,
        paddingTop: SPACING.lg,
      },
      exerciseCard: {
        backgroundColor: chrome.surface.backgroundColor,
        borderRadius: BORDER_RADIUS.hero,
        marginBottom: SPACING.md,
        overflow: 'hidden' as const,
        borderWidth: 1,
        borderColor: chrome.surface.borderColor,
        ...chrome.surface.shadowStyle,
      },
      exerciseImage: {
        width: '100%' as const,
        height: 200,
        backgroundColor: chrome.chart.emptyBackground,
      },
      difficultyBadge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.xs,
        borderRadius: BORDER_RADIUS.full,
        borderWidth: 1,
        borderColor: chrome.chip.borderColor,
      },
    };
  })(),
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: SIZES.md,
    color: colors.primaryText,
  },
  exerciseContent: {
    padding: SPACING.lg,
  },
  exerciseName: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
    marginBottom: SPACING.sm,
  },
  exerciseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseDuration: {
    fontSize: SIZES.sm,
    color: colors.gray,
  },
  difficultyEasy: {
    backgroundColor: withAlpha(colors.success, isDark ? 0.2 : 0.12),
  },
  difficultyMedium: {
    backgroundColor: withAlpha(colors.warning, isDark ? 0.2 : 0.12),
  },
  difficultyHard: {
    backgroundColor: withAlpha(colors.error, isDark ? 0.2 : 0.12),
  },
  difficultyText: {
    fontSize: SIZES.xs,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: SIZES.lg,
    color: colors.gray,
  },
});
