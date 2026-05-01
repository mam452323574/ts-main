import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowDownAZ, ArrowUpAZ, Search, Siren } from 'lucide-react-native';

import { SOCIAL_ADMIN_MODERATION_FILTERS } from '@/constants/social';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialAdminModerationFilter } from '@/types';

import type { AdminModerationSortMode } from './adminModerationUtils';

const SORT_OPTIONS: AdminModerationSortMode[] = [
  'urgent',
  'recent',
  'oldest',
];

interface AdminModerationToolbarProps {
  selectedFilter: SocialAdminModerationFilter;
  sortMode: AdminModerationSortMode;
  searchQuery: string;
  counts: Record<SocialAdminModerationFilter, number>;
  onFilterChange: (filter: SocialAdminModerationFilter) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (mode: AdminModerationSortMode) => void;
}

function renderSortIcon(
  mode: AdminModerationSortMode,
  color: string,
) {
  if (mode === 'urgent') {
    return <Siren color={color} size={16} />;
  }

  if (mode === 'oldest') {
    return <ArrowUpAZ color={color} size={16} />;
  }

  return <ArrowDownAZ color={color} size={16} />;
}

export function AdminModerationToolbar({
  selectedFilter,
  sortMode,
  searchQuery,
  counts,
  onFilterChange,
  onSearchChange,
  onSortChange,
}: AdminModerationToolbarProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrapper} testID="admin-social-toolbar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        testID="admin-social-filters"
      >
        {SOCIAL_ADMIN_MODERATION_FILTERS.map((filter) => {
          const isActive = filter === selectedFilter;

          return (
            <TouchableOpacity
              key={filter}
              accessibilityRole="button"
              onPress={() => onFilterChange(filter)}
              style={[
                styles.filterPill,
                isActive ? styles.filterPillActive : null,
              ]}
              testID={`admin-social-filter-${filter}`}
            >
              <View style={styles.filterTextWrap}>
                <Text
                  style={[
                    styles.filterLabel,
                    isActive ? styles.filterLabelActive : null,
                  ]}
                >
                  {t(`social.admin.filters.${filter}`)}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    isActive ? styles.countBadgeActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeLabel,
                      isActive ? styles.countBadgeLabelActive : null,
                    ]}
                  >
                    {counts[filter]}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchShell}>
        <Search color={colors.gray} size={18} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={t('social.admin.toolbar.search_placeholder')}
          placeholderTextColor={colors.gray}
          style={styles.searchInput}
          testID="admin-social-search-input"
        />
      </View>

      <View style={styles.sortRow} testID="admin-social-sort-row">
        {SORT_OPTIONS.map((mode) => {
          const isActive = mode === sortMode;

          return (
            <TouchableOpacity
              key={mode}
              accessibilityRole="button"
              onPress={() => onSortChange(mode)}
              style={[
                styles.sortPill,
                isActive ? styles.sortPillActive : null,
              ]}
              testID={`admin-social-sort-${mode}`}
            >
              {renderSortIcon(
                mode,
                isActive ? colors.primary : colors.gray,
              )}
              <Text
                style={[
                  styles.sortLabel,
                  isActive ? styles.sortLabelActive : null,
                ]}
              >
                {t(`social.admin.sort.${mode}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrapper: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm + 2,
      backgroundColor: withAlpha(colors.background, 0.98),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
      ...SHADOWS.header,
    },
    filterRow: {
      gap: SPACING.xs + 2,
      paddingRight: SPACING.page,
    },
    filterPill: {
      minHeight: 40,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      justifyContent: 'center',
    },
    filterPillActive: {
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.2),
    },
    filterTextWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    filterLabel: {
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    filterLabelActive: {
      color: colors.primary,
    },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xs,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    countBadgeActive: {
      backgroundColor: withAlpha(colors.primary, 0.16),
      borderColor: withAlpha(colors.primary, 0.2),
    },
    countBadgeLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    countBadgeLabelActive: {
      color: colors.primary,
    },
    searchShell: {
      minHeight: 42,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    searchInput: {
      flex: 1,
      minHeight: 42,
      color: colors.primaryText,
      fontSize: 13,
    },
    sortRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
    },
    sortPill: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    sortPillActive: {
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.2),
    },
    sortLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? colors.gray,
    },
    sortLabelActive: {
      color: colors.primary,
    },
  });

export default AdminModerationToolbar;
