import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { useRecipes } from '@/hooks/queries/useRecipes';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppScreen } from '@/components/AppScreen';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ModalHandle } from '@/components/ModalHandle';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, getMainPageChrome, withAlpha } from '@/constants/theme';

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
            <Text style={[styles.difficultyText, { color: getDifficultyTextColor(item.difficulty, colors) }]}>
              {t(`recipes.difficulty.${item.difficulty}`)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <AppScreen style={styles.container}>
      <ModalHandle />
      <ScreenHeader
        title={t('recipes.title')}
        variant="inline"
        topInset={false}
        centered
        testID="recipes-screen-header"
      />
      <View style={styles.searchSection}>
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
          <ScreenState tone="empty" title={t('recipes.no_results')} testID="recipes-empty-state" />
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          renderItem={renderRecipe}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
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
    const chrome = getMainPageChrome(colors, isDark, 'nutrition');

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
      recipeCard: {
        backgroundColor: chrome.surface.backgroundColor,
        borderRadius: BORDER_RADIUS.hero,
        marginBottom: SPACING.md,
        overflow: 'hidden' as const,
        borderWidth: 1,
        borderColor: chrome.surface.borderColor,
        ...chrome.surface.shadowStyle,
      },
      recipeImage: {
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
  recipeContent: {
    padding: SPACING.lg,
  },
  recipeName: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
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
