import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { useExercises } from '@/hooks/queries';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ModalHandle } from '@/components/ModalHandle';
import { SIZES, SPACING, BORDER_RADIUS } from '@/constants/theme';

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

  const renderExercise = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.exerciseCard}>
      <Image source={{ uri: item.image_url }} style={styles.exerciseImage} />
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
            <Text style={[styles.difficultyText, { color: getDifficultyTextColor(item.difficulty, isDark) }]}>
              {t(`exercises.difficulty.${item.difficulty}`)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ModalHandle />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('exercises.title')}</Text>
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
          <Text style={styles.emptyText}>{t('exercises.no_results')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredExercises}
          renderItem={renderExercise}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const getDifficultyTextColor = (difficulty: string, isDark: boolean) => {
  if (isDark) {
    switch (difficulty) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'hard': return '#F44336';
      default: return '#666';
    }
  }
  return '#666';
};

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: SPACING.lg,
    paddingTop: SPACING.xxl,
    backgroundColor: colors.cardBackground,
  },
  headerTitle: {
    fontSize: SIZES.xxl,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: SPACING.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightGray,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: SIZES.md,
    color: colors.primaryText,
  },
  list: {
    padding: SPACING.lg,
  },
  exerciseCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  exerciseImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.lightGray,
  },
  exerciseContent: {
    padding: SPACING.md,
  },
  exerciseName: {
    fontSize: SIZES.lg,
    fontWeight: '600',
    color: colors.primary,
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
  difficultyBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  difficultyEasy: {
    backgroundColor: isDark ? 'rgba(76, 175, 80, 0.2)' : '#E8F5E9',
  },
  difficultyMedium: {
    backgroundColor: isDark ? 'rgba(255, 152, 0, 0.2)' : '#FFF3E0',
  },
  difficultyHard: {
    backgroundColor: isDark ? 'rgba(244, 67, 54, 0.2)' : '#FFEBEE',
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
