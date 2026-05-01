import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { useRecipes } from '@/hooks/queries';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ModalHandle } from '@/components/ModalHandle';
import { SIZES, SPACING, BORDER_RADIUS } from '@/constants/theme';

export default function RecipesScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // React Query hook
  const { data: recipes = [], isLoading, error } = useRecipes();

  // Filtrage des recettes avec useMemo pour optimisation
  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes;
    return recipes.filter((recipe: any) =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, recipes]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  const renderRecipe = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.recipeCard}>
      <Image source={{ uri: item.image_url }} style={styles.recipeImage} />
      <View style={styles.recipeContent}>
        <Text style={styles.recipeName}>{item.name}</Text>
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeTime}>{item.preparation_time} {t('recipes.prep_time')}</Text>
          <View
            style={[
              styles.difficultyBadge,
              item.difficulty === 'easy' && styles.difficultyEasy,
              item.difficulty === 'medium' && styles.difficultyMedium,
              item.difficulty === 'hard' && styles.difficultyHard,
            ]}
          >
            <Text style={[styles.difficultyText, { color: getDifficultyTextColor(item.difficulty, isDark) }]}>
              {t(`recipes.difficulty.${item.difficulty}`)}
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
        <Text style={styles.headerTitle}>{t('recipes.title')}</Text>
        <View style={styles.searchContainer}>
          <Search color={colors.gray} size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('recipes.search_placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.gray}
          />
        </View>
      </View>

      {filteredRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('recipes.no_results')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          renderItem={renderRecipe}
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
  recipeCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  recipeImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.lightGray,
  },
  recipeContent: {
    padding: SPACING.md,
  },
  recipeName: {
    fontSize: SIZES.lg,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: SPACING.sm,
  },
  recipeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeTime: {
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
