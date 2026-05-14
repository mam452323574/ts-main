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
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialAdminModerationFilter } from '@/types';

import type { AdminModerationSortMode } from './adminModerationUtils';
import {
  buildAdminChromePalette,
  resolveAdminSortAccent,
} from './adminModerationTheme';

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
    return <Siren color={color} size={15} />;
  }

  if (mode === 'oldest') {
    return <ArrowUpAZ color={color} size={15} />;
  }

  return <ArrowDownAZ color={color} size={15} />;
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
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, selectedFilter),
    [colors, selectedFilter],
  );
  const styles = useMemo(() => createStyles(chrome), [chrome]);

  return (
    <View style={styles.wrapper} testID="admin-social-toolbar">
      <View style={styles.filterPanel}>
        <View style={styles.panelChrome} />

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
          <Search color={chrome.textMuted} size={18} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder={t('social.admin.toolbar.search_placeholder')}
            placeholderTextColor={chrome.textMuted}
            style={styles.searchInput}
            selectionColor={chrome.filterAccent}
            testID="admin-social-search-input"
          />
        </View>

        <View style={styles.sortTrack} testID="admin-social-sort-row">
          {SORT_OPTIONS.map((mode) => {
            const isActive = mode === sortMode;
            const accent = resolveAdminSortAccent(mode, chrome);

            return (
              <TouchableOpacity
                key={mode}
                accessibilityRole="button"
                onPress={() => onSortChange(mode)}
                style={[
                  styles.sortPill,
                  isActive
                    ? [
                        styles.sortPillActive,
                        {
                          backgroundColor: withAlpha(accent, 0.16),
                          borderColor: withAlpha(accent, 0.26),
                        },
                      ]
                    : null,
                ]}
                testID={`admin-social-sort-${mode}`}
              >
                {renderSortIcon(
                  mode,
                  isActive ? accent : chrome.textMuted,
                )}
                <Text
                  style={[
                    styles.sortLabel,
                    isActive ? { color: accent } : null,
                  ]}
                >
                  {t(`social.admin.sort.${mode}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const createStyles = (chrome: ReturnType<typeof buildAdminChromePalette>) =>
  StyleSheet.create({
    wrapper: {
      paddingTop: SPACING.xs + 2,
    },
    filterPanel: {
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.hero,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 22,
      elevation: 7,
    },
    panelChrome: {
      position: 'absolute',
      top: -44,
      right: -28,
      width: 156,
      height: 156,
      borderRadius: 78,
      backgroundColor: chrome.filterAccentHalo,
    },
    filterRow: {
      gap: SPACING.xs + 2,
      paddingRight: SPACING.sm,
    },
    filterPill: {
      minHeight: 42,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      justifyContent: 'center',
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
    },
    filterPillActive: {
      backgroundColor: chrome.filterAccentSoft,
      borderColor: chrome.filterAccentBorder,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 18,
      elevation: 4,
    },
    filterTextWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    filterLabel: {
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textSecondary,
    },
    filterLabelActive: {
      color: chrome.textPrimary,
    },
    countBadge: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xs,
      backgroundColor: withAlpha(chrome.textPrimary, 0.04),
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
    },
    countBadgeActive: {
      backgroundColor: withAlpha(chrome.textPrimary, 0.08),
      borderColor: chrome.filterAccentBorder,
    },
    countBadgeLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textMuted,
    },
    countBadgeLabelActive: {
      color: chrome.textPrimary,
    },
    searchShell: {
      minHeight: 46,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: withAlpha(chrome.screenBackground, 0.48),
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
    },
    searchInput: {
      flex: 1,
      minHeight: 46,
      color: chrome.textPrimary,
      fontSize: 13,
    },
    sortTrack: {
      flexDirection: 'row',
      gap: SPACING.xs,
      padding: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(chrome.screenBackground, 0.44),
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
    },
    sortPill: {
      flex: 1,
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    sortPillActive: {
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 3,
    },
    sortLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textMuted,
    },
  });

export default AdminModerationToolbar;
