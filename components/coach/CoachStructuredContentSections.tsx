import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import type {
  CoachNextScanType,
  CoachReminderRecurrence,
  CoachShoppingSection,
  CoachStructuredContent,
} from '@/shared/coachContent';

export interface CoachStructuredContentLabels {
  context_notes?: string;
  priorities?: string;
  action_steps?: string;
  warnings?: string;
  data_gaps?: string;
  meal_template?: string;
  meal_swaps?: string;
  shopping_list?: string;
  quick_recipe?: string;
  daily_schedule?: string;
  micro_routine?: string;
  habit_tracker?: string;
  reminders?: string;
  knowledge_card?: string;
  next_scan_suggestion?: string;
  signal_watch?: string;
  streak_celebration?: string;
  shopping_sections?: Partial<Record<CoachShoppingSection, string>>;
  scan_types?: Partial<Record<CoachNextScanType, string>>;
  recurrences?: Partial<Record<CoachReminderRecurrence, string>>;
  today?: string;
  in_days?: string;
  days_per_week?: string;
  minutes?: string;
  formatters?: CoachStructuredContentFormatters;
}

export interface CoachStructuredContentFormatters {
  daysPerWeek?: (count: number) => string;
  inDays?: (count: number) => string;
  minutes?: (count: number) => string;
}

interface CoachStructuredContentSectionsProps {
  content: CoachStructuredContent;
  labels?: CoachStructuredContentLabels;
  showSummary?: boolean;
  skipFirstActionStep?: boolean;
  testIDPrefix?: string;
}

const DEFAULT_LABELS: Required<
  Omit<
    CoachStructuredContentLabels,
    'shopping_sections' | 'scan_types' | 'recurrences' | 'formatters'
  >
> & {
  shopping_sections: Record<CoachShoppingSection, string>;
  scan_types: Record<CoachNextScanType, string>;
  recurrences: Record<CoachReminderRecurrence, string>;
} = {
  context_notes: 'Ce que je remarque',
  priorities: 'À surveiller',
  action_steps: 'À faire maintenant',
  warnings: 'Vigilance',
  data_gaps: 'Zones sans assez de données',
  meal_template: 'Prochain repas',
  meal_swaps: 'Échanges malins',
  shopping_list: 'Liste de courses',
  quick_recipe: 'Recette flash',
  daily_schedule: 'Planning',
  micro_routine: 'Routine courte',
  habit_tracker: 'Habitudes à tenir',
  reminders: 'Rappels',
  knowledge_card: 'À savoir',
  next_scan_suggestion: 'Prochain scan',
  signal_watch: 'Signaux à surveiller',
  streak_celebration: 'Série en cours',
  today: "aujourd'hui",
  in_days: 'dans {{count}}j',
  days_per_week: '{{count}}j/7',
  minutes: '{{count}} min',
  shopping_sections: {
    frais: 'Frais',
    sec: 'Sec',
    boissons: 'Boissons',
    snacks: 'Snacks',
    autre: 'Autre',
  },
  scan_types: {
    face: 'visage',
    body: 'corps',
    nutrition: 'nutrition',
    super: 'super scan',
    health: 'santé',
  },
  recurrences: {
    today: "aujourd'hui",
    daily: 'quotidien',
    weekly: 'hebdo',
  },
};

function resolveLabels(labels?: CoachStructuredContentLabels) {
  return {
    ...DEFAULT_LABELS,
    ...(labels ?? {}),
    shopping_sections: {
      ...DEFAULT_LABELS.shopping_sections,
      ...(labels?.shopping_sections ?? {}),
    },
    scan_types: {
      ...DEFAULT_LABELS.scan_types,
      ...(labels?.scan_types ?? {}),
    },
    recurrences: {
      ...DEFAULT_LABELS.recurrences,
      ...(labels?.recurrences ?? {}),
    },
  };
}

function hasMissingI18nMarker(value: string) {
  return value.includes('[missing') || value.includes('translation missing');
}

function interpolateCount(template: string, count: number) {
  return template.replace(/{{\s*count\s*}}/g, String(count));
}

function formatTemplate(template: string, count: number, fallbackTemplate = template) {
  const formatted = interpolateCount(template, count);
  return hasMissingI18nMarker(formatted)
    ? interpolateCount(fallbackTemplate, count)
    : formatted;
}

function formatCount(
  formatter: ((count: number) => string) | undefined,
  template: string,
  fallbackTemplate: string,
  count: number,
) {
  const formatted = formatter?.(count);
  return formatted && !hasMissingI18nMarker(formatted)
    ? formatted
    : formatTemplate(template, count, fallbackTemplate);
}

function formatDaysPerWeek(
  labels: ReturnType<typeof resolveLabels>,
  formatters: CoachStructuredContentFormatters | undefined,
  value: number,
) {
  return formatCount(
    formatters?.daysPerWeek,
    labels.days_per_week,
    DEFAULT_LABELS.days_per_week,
    value,
  );
}

function formatInDays(
  labels: ReturnType<typeof resolveLabels>,
  formatters: CoachStructuredContentFormatters | undefined,
  value: number,
) {
  return formatCount(
    formatters?.inDays,
    labels.in_days,
    DEFAULT_LABELS.in_days,
    value,
  );
}

function formatMinutes(
  labels: ReturnType<typeof resolveLabels>,
  formatters: CoachStructuredContentFormatters | undefined,
  value: number | null,
) {
  return value
    ? formatCount(formatters?.minutes, labels.minutes, DEFAULT_LABELS.minutes, value)
    : null;
}

function hasItems(items: readonly unknown[] | null | undefined) {
  return Array.isArray(items) && items.length > 0;
}

export function hasRenderableCoachStructuredContent(
  content: CoachStructuredContent | null | undefined,
  options: { showSummary?: boolean; skipFirstActionStep?: boolean } = {},
) {
  if (!content) {
    return false;
  }

  const actionSteps = options.skipFirstActionStep
    ? content.action_steps.slice(1)
    : content.action_steps;

  return (
    (options.showSummary !== false && content.summary.length > 0) ||
    hasItems(content.context_notes) ||
    hasItems(content.priorities) ||
    actionSteps.length > 0 ||
    hasItems(content.warnings) ||
    hasItems(content.data_gaps) ||
    hasItems(content.daily_schedule) ||
    hasItems(content.micro_routine) ||
    !!content.meal_template ||
    hasItems(content.meal_swaps) ||
    hasItems(content.shopping_list) ||
    !!content.quick_recipe ||
    !!content.knowledge_card ||
    hasItems(content.habit_tracker) ||
    hasItems(content.reminders) ||
    !!content.next_scan_suggestion ||
    hasItems(content.signal_watch) ||
    !!content.encouragement ||
    !!content.streak_celebration
  );
}

export function getCoachStructuredTeaser(
  content: CoachStructuredContent | null | undefined,
  labels?: CoachStructuredContentLabels,
) {
  if (!content) {
    return null;
  }

  const resolvedLabels = resolveLabels(labels);

  if (content.meal_template) {
    return `${resolvedLabels.meal_template}: ${content.meal_template.name}`;
  }

  if (content.quick_recipe) {
    return `${resolvedLabels.quick_recipe}: ${content.quick_recipe.name}`;
  }

  const firstHabit = content.habit_tracker?.[0];
  if (firstHabit) {
    return `${resolvedLabels.habit_tracker}: ${firstHabit.label}`;
  }

  const firstRoutine = content.micro_routine?.[0];
  if (firstRoutine) {
    return `${resolvedLabels.micro_routine}: ${firstRoutine.name}`;
  }

  return null;
}

export function CoachStructuredContentSections({
  content,
  labels,
  showSummary = true,
  skipFirstActionStep = false,
  testIDPrefix = 'coach-section',
}: CoachStructuredContentSectionsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedLabels = useMemo(() => resolveLabels(labels), [labels]);
  const formatters = labels?.formatters;
  const actionSteps = skipFirstActionStep
    ? content.action_steps.slice(1)
    : content.action_steps;

  const groupedShoppingList = useMemo(() => {
    const groups: Partial<Record<CoachShoppingSection, string[]>> = {};
    for (const item of content.shopping_list ?? []) {
      groups[item.section] = [...(groups[item.section] ?? []), item.item];
    }
    return groups;
  }, [content.shopping_list]);

  return (
    <View style={styles.container} testID={`${testIDPrefix}-content`}>
      {showSummary && content.summary ? (
        <Text style={styles.summary}>{content.summary}</Text>
      ) : null}

      {actionSteps.length > 0 ? (
        <Section
          label={resolvedLabels.action_steps}
          styles={styles}
          testID={`${testIDPrefix}-action_steps`}
        >
          {actionSteps.map((step, index) => (
            <Text key={`action-${index}`} style={styles.actionItem}>
              {step}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.context_notes.length > 0 ? (
        <Section
          label={resolvedLabels.context_notes}
          styles={styles}
          testID={`${testIDPrefix}-context_notes`}
        >
          {content.context_notes.map((note, index) => (
            <Text key={`context-${index}`} style={styles.item}>
              {note}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.priorities.length > 0 ? (
        <Section
          label={resolvedLabels.priorities}
          styles={styles}
          testID={`${testIDPrefix}-priorities`}
        >
          {content.priorities.map((priority, index) => (
            <Text key={`priority-${index}`} style={styles.item}>
              {priority}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.warnings.length > 0 ? (
        <Section
          label={resolvedLabels.warnings}
          styles={styles}
          testID={`${testIDPrefix}-warnings`}
          tone="warning"
        >
          {content.warnings.map((warning, index) => (
            <Text key={`warning-${index}`} style={styles.item}>
              {warning}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.data_gaps.length > 0 ? (
        <Section
          label={resolvedLabels.data_gaps}
          styles={styles}
          testID={`${testIDPrefix}-data_gaps`}
          tone="muted"
        >
          {content.data_gaps.map((gap, index) => (
            <Text key={`gap-${index}`} style={styles.mutedItem}>
              {gap}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.meal_template ? (
        <Section
          label={resolvedLabels.meal_template}
          styles={styles}
          testID={`${testIDPrefix}-meal_template`}
        >
          <Text style={styles.lead}>
            {[
              content.meal_template.name,
              content.meal_template.when,
              formatMinutes(
                resolvedLabels,
                formatters,
                content.meal_template.prep_min,
              ),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {content.meal_template.ingredients.map((ingredient, index) => (
            <Text key={`ingredient-${index}`} style={styles.item}>
              {ingredient.portion
                ? `${ingredient.item} — ${ingredient.portion}`
                : ingredient.item}
            </Text>
          ))}
          {content.meal_template.why ? (
            <Text style={styles.note}>{content.meal_template.why}</Text>
          ) : null}
        </Section>
      ) : null}

      {content.quick_recipe ? (
        <Section
          label={resolvedLabels.quick_recipe}
          styles={styles}
          testID={`${testIDPrefix}-quick_recipe`}
        >
          <Text style={styles.lead}>
            {[
              content.quick_recipe.name,
              formatMinutes(
                resolvedLabels,
                formatters,
                content.quick_recipe.total_min,
              ),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {content.quick_recipe.steps.map((step, index) => (
            <Text key={`recipe-${index}`} style={styles.item}>
              {`${index + 1}. ${step}`}
            </Text>
          ))}
          {content.quick_recipe.tags.length > 0 ? (
            <View style={styles.chipRow}>
              {content.quick_recipe.tags.map((tag) => (
                <Text key={tag} style={styles.chipText}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </Section>
      ) : null}

      {content.meal_swaps && content.meal_swaps.length > 0 ? (
        <Section
          label={resolvedLabels.meal_swaps}
          styles={styles}
          testID={`${testIDPrefix}-meal_swaps`}
        >
          {content.meal_swaps.map((swap, index) => (
            <View key={`swap-${index}`} style={styles.compoundItem}>
              <Text style={styles.actionItem}>{`${swap.from} → ${swap.to}`}</Text>
              {swap.why ? <Text style={styles.note}>{swap.why}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {content.shopping_list && content.shopping_list.length > 0 ? (
        <Section
          label={resolvedLabels.shopping_list}
          styles={styles}
          testID={`${testIDPrefix}-shopping_list`}
        >
          {Object.entries(groupedShoppingList).map(([section, items]) =>
            items && items.length > 0 ? (
              <Text key={section} style={styles.item}>
                {`${resolvedLabels.shopping_sections[section as CoachShoppingSection]}: ${items.join(', ')}`}
              </Text>
            ) : null,
          )}
        </Section>
      ) : null}

      {content.daily_schedule && content.daily_schedule.length > 0 ? (
        <Section
          label={resolvedLabels.daily_schedule}
          styles={styles}
          testID={`${testIDPrefix}-daily_schedule`}
        >
          {content.daily_schedule.map((day) => (
            <View key={day.day} style={styles.compoundItem}>
              <Text style={styles.lead}>{day.day}</Text>
              {day.slots.map((slot, index) => (
                <Text key={`${slot.time}-${index}`} style={styles.item}>
                  {[
                    slot.time,
                    slot.action,
                    formatMinutes(resolvedLabels, formatters, slot.duration_min),
                    slot.tag,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {content.micro_routine && content.micro_routine.length > 0 ? (
        <Section
          label={resolvedLabels.micro_routine}
          styles={styles}
          testID={`${testIDPrefix}-micro_routine`}
        >
          {content.micro_routine.map((routine) => (
            <View key={routine.name} style={styles.compoundItem}>
              <Text style={styles.lead}>
                {[
                  routine.name,
                  routine.when,
                  formatMinutes(resolvedLabels, formatters, routine.total_min),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {routine.steps.map((step, index) => (
                <Text key={`routine-${index}`} style={styles.item}>
                  {step}
                </Text>
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {content.habit_tracker && content.habit_tracker.length > 0 ? (
        <Section
          label={resolvedLabels.habit_tracker}
          styles={styles}
          testID={`${testIDPrefix}-habit_tracker`}
        >
          {content.habit_tracker.map((habit, index) => (
            <Text key={`habit-${index}`} style={styles.actionItem}>
              {[
                habit.label,
                formatDaysPerWeek(resolvedLabels, formatters, habit.target_days),
                habit.window,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.reminders && content.reminders.length > 0 ? (
        <Section
          label={resolvedLabels.reminders}
          styles={styles}
          testID={`${testIDPrefix}-reminders`}
        >
          {content.reminders.map((reminder, index) => (
            <Text key={`reminder-${index}`} style={styles.item}>
              {[
                reminder.at,
                reminder.label,
                resolvedLabels.recurrences[reminder.recurrence],
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.knowledge_card ? (
        <Section
          label={resolvedLabels.knowledge_card}
          styles={styles}
          testID={`${testIDPrefix}-knowledge_card`}
        >
          <Text style={styles.lead}>{content.knowledge_card.title}</Text>
          <Text style={styles.item}>{content.knowledge_card.body}</Text>
          {content.knowledge_card.takeaway ? (
            <Text style={styles.note}>{content.knowledge_card.takeaway}</Text>
          ) : null}
        </Section>
      ) : null}

      {content.next_scan_suggestion ? (
        <Section
          label={resolvedLabels.next_scan_suggestion}
          styles={styles}
          testID={`${testIDPrefix}-next_scan_suggestion`}
        >
          <Text style={styles.actionItem}>
            {[
              resolvedLabels.scan_types[content.next_scan_suggestion.scan_type],
              content.next_scan_suggestion.in_days === 0
                ? resolvedLabels.today
                : formatInDays(
                    resolvedLabels,
                    formatters,
                    content.next_scan_suggestion.in_days,
                  ),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {content.next_scan_suggestion.reason ? (
            <Text style={styles.note}>{content.next_scan_suggestion.reason}</Text>
          ) : null}
        </Section>
      ) : null}

      {content.signal_watch && content.signal_watch.length > 0 ? (
        <Section
          label={resolvedLabels.signal_watch}
          styles={styles}
          testID={`${testIDPrefix}-signal_watch`}
        >
          {content.signal_watch.map((signal, index) => (
            <View key={`signal-${index}`} style={styles.compoundItem}>
              <Text style={styles.lead}>{signal.signal}</Text>
              <Text style={styles.item}>{signal.what_to_notice}</Text>
              {signal.when_to_escalate ? (
                <Text style={styles.note}>{signal.when_to_escalate}</Text>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}

      {content.encouragement ? (
        <Text style={styles.encouragement} testID={`${testIDPrefix}-encouragement`}>
          {content.encouragement}
        </Text>
      ) : null}

      {content.streak_celebration ? (
        <Section
          label={resolvedLabels.streak_celebration}
          styles={styles}
          testID={`${testIDPrefix}-streak_celebration`}
        >
          <Text style={styles.actionItem}>
            {content.streak_celebration.message}
          </Text>
        </Section>
      ) : null}
    </View>
  );
}

function Section({
  children,
  label,
  styles,
  testID,
  tone = 'default',
}: {
  children: ReactNode;
  label: string;
  styles: ReturnType<typeof createStyles>;
  testID: string;
  tone?: 'default' | 'warning' | 'muted';
}) {
  return (
    <View
      style={[
        styles.section,
        tone === 'warning' ? styles.warningSection : null,
        tone === 'muted' ? styles.mutedSection : null,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.sectionLabel,
          tone === 'warning' ? styles.warningLabel : null,
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      gap: SPACING.sm,
      paddingTop: SPACING.xs,
    },
    summary: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    section: {
      gap: 4,
      paddingVertical: SPACING.xs,
    },
    sectionLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.68),
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
    lead: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    item: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    actionItem: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    mutedItem: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.94),
    },
    note: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.72),
    },
    compoundItem: {
      gap: 2,
      paddingVertical: 2,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      paddingTop: 2,
    },
    chipText: {
      overflow: 'hidden',
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.05),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      fontSize: 11,
      lineHeight: 14,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.76),
    },
    warningSection: {
      backgroundColor: withAlpha(colors.warning, 0.08),
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.22),
    },
    warningLabel: {
      color: colors.warning,
    },
    mutedSection: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
    },
    encouragement: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontStyle: 'italic',
      color: withAlpha(colors.primaryText, 0.86),
      paddingTop: SPACING.xs,
    },
  });
