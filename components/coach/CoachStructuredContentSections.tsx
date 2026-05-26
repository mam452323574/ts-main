import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  ChefHat,
  Clock3,
  Compass,
  Eye,
  Flame,
  Heart,
  Repeat,
  ScanLine,
  ShoppingBag,
  Target,
  Utensils,
} from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getCoachPaperSurface,
  withAlpha,
} from '@/constants/theme';
import type {
  CoachNextScanType,
  CoachReminderRecurrence,
  CoachShoppingSection,
  CoachStructuredContent,
} from '@/shared/coachContent';
import { Squircle } from '@/components/Squircle';

export interface CoachStructuredContentLabels {
  context_notes?: string;
  priorities?: string;
  action_steps?: string;
  warnings?: string;
  /**
   * @deprecated Le champ `data_gaps` n'est plus rendu côté UI. Conservé dans
   * l'interface pour compatibilité ascendante des i18n callers existants — il
   * peut être passé sans effet visuel.
   */
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
  // 'numbered' (default) renders 01./02./… ; 'checked' renders ✓ bullets — used when a
  // hero "primary action" tile already carries the 01. label upstream, to avoid the
  // double-01 visual bug.
  actionStepsStyle?: 'numbered' | 'checked';
  testIDPrefix?: string;
  accentColor?: string;
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
  // `data_gaps` n'est plus rendu côté UI ; la clé est laissée pour ne pas casser
  // les callers i18n existants, mais elle n'est utilisée par aucune section.
  data_gaps: '',
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
  actionStepsStyle = 'numbered',
  testIDPrefix = 'coach-section',
  accentColor,
}: CoachStructuredContentSectionsProps) {
  const { colors, isDark } = useTheme();
  const resolvedAccent = accentColor ?? (colors.primary as string) ?? colors.primaryText;
  const paper = useMemo(() => getCoachPaperSurface(isDark), [isDark]);
  const warningIconColor = withAlpha(colors.warning, 0.85);
  const iconColor = withAlpha(resolvedAccent, 0.78);
  const styles = useMemo(
    () => createStyles(colors, resolvedAccent, paper),
    [colors, paper, resolvedAccent],
  );
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
        <View style={styles.summaryQuoteWrap}>
          <Squircle style={styles.summaryQuoteRule} />
          <Text style={styles.summaryQuoteText}>{content.summary}</Text>
        </View>
      ) : null}

      {actionSteps.length > 0 ? (
        <Section
          iconKey="action_steps"
          iconColor={iconColor}
          label={resolvedLabels.action_steps}
          styles={styles}
          testID={`${testIDPrefix}-action_steps`}
        >
          {actionSteps.map((step, index) =>
            actionStepsStyle === 'checked' ? (
              <CheckedItem
                key={`action-${index}`}
                styles={styles}
                checkColor={iconColor}
              >
                {step}
              </CheckedItem>
            ) : (
              <NumberedItem
                key={`action-${index}`}
                index={skipFirstActionStep ? index + 1 : index}
                styles={styles}
              >
                {step}
              </NumberedItem>
            ),
          )}
        </Section>
      ) : null}

      {content.context_notes.length > 0 ? (
        <Section
          iconKey="context_notes"
          iconColor={iconColor}
          label={resolvedLabels.context_notes}
          styles={styles}
          testID={`${testIDPrefix}-context_notes`}
        >
          {content.context_notes.map((note, index) => (
            <BulletItem key={`context-${index}`} styles={styles}>
              {note}
            </BulletItem>
          ))}
        </Section>
      ) : null}

      {content.priorities.length > 0 ? (
        <Section
          iconKey="priorities"
          iconColor={iconColor}
          label={resolvedLabels.priorities}
          styles={styles}
          testID={`${testIDPrefix}-priorities`}
        >
          {content.priorities.map((priority, index) => (
            <BulletItem key={`priority-${index}`} styles={styles}>
              {priority}
            </BulletItem>
          ))}
        </Section>
      ) : null}

      {content.warnings.length > 0 ? (
        <Section
          iconKey="warnings"
          iconColor={iconColor}
          label={resolvedLabels.warnings}
          styles={styles}
          testID={`${testIDPrefix}-warnings`}
          tone="warning"
          warningIconColor={warningIconColor}
        >
          {content.warnings.map((warning, index) => (
            <BulletItem key={`warning-${index}`} styles={styles} tone="warning">
              {warning}
            </BulletItem>
          ))}
        </Section>
      ) : null}

      {content.meal_template ? (
        <Section
          iconKey="meal_template"
          iconColor={iconColor}
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
          iconKey="quick_recipe"
          iconColor={iconColor}
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
          iconKey="meal_swaps"
          iconColor={iconColor}
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
          iconKey="shopping_list"
          iconColor={iconColor}
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
          iconKey="daily_schedule"
          iconColor={iconColor}
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
          iconKey="micro_routine"
          iconColor={iconColor}
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
          iconKey="habit_tracker"
          iconColor={iconColor}
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
          iconKey="reminders"
          iconColor={iconColor}
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
          iconKey="knowledge_card"
          iconColor={iconColor}
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
          iconKey="next_scan_suggestion"
          iconColor={iconColor}
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
          iconKey="signal_watch"
          iconColor={iconColor}
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
        <View
          style={styles.encouragementRow}
          testID={`${testIDPrefix}-encouragement`}
        >
          <Heart
            color={iconColor}
            size={14}
            strokeWidth={2}
            style={styles.encouragementIcon}
          />
          <Text style={styles.encouragement}>{content.encouragement}</Text>
        </View>
      ) : null}

      {content.streak_celebration ? (
        <Section
          iconKey="streak_celebration"
          iconColor={iconColor}
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

type SectionIconKey =
  | 'context_notes'
  | 'priorities'
  | 'action_steps'
  | 'warnings'
  | 'meal_template'
  | 'meal_swaps'
  | 'shopping_list'
  | 'quick_recipe'
  | 'daily_schedule'
  | 'micro_routine'
  | 'habit_tracker'
  | 'reminders'
  | 'knowledge_card'
  | 'next_scan_suggestion'
  | 'signal_watch'
  | 'streak_celebration';

const SECTION_ICONS: Record<SectionIconKey, typeof Eye> = {
  context_notes: Eye,
  priorities: Compass,
  action_steps: Target,
  warnings: AlertTriangle,
  meal_template: Utensils,
  meal_swaps: ArrowLeftRight,
  shopping_list: ShoppingBag,
  quick_recipe: ChefHat,
  daily_schedule: CalendarClock,
  micro_routine: Clock3,
  habit_tracker: Repeat,
  reminders: Bell,
  knowledge_card: BookOpen,
  next_scan_suggestion: ScanLine,
  signal_watch: Activity,
  streak_celebration: Flame,
};

function Section({
  children,
  iconKey,
  iconColor,
  label,
  styles,
  testID,
  tone = 'default',
  warningIconColor,
}: {
  children: ReactNode;
  iconKey?: SectionIconKey;
  iconColor: string;
  label: string;
  styles: ReturnType<typeof createStyles>;
  testID: string;
  tone?: 'default' | 'warning';
  warningIconColor?: string;
}) {
  const Icon = iconKey ? SECTION_ICONS[iconKey] : null;
  const resolvedIconColor =
    tone === 'warning' ? (warningIconColor ?? iconColor) : iconColor;
  return (
    <View
      style={[
        styles.section,
        tone === 'warning' ? styles.warningSection : null,
      ]}
      testID={testID}
    >
      <View style={styles.sectionLabelRow}>
        {Icon ? (
          <Icon
            color={resolvedIconColor}
            size={13}
            strokeWidth={2}
          />
        ) : null}
        <Text
          style={[
            styles.sectionLabel,
            tone === 'warning' ? styles.warningLabel : null,
          ]}
        >
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function BulletItem({
  children,
  styles,
  tone = 'default',
}: {
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
  tone?: 'default' | 'warning';
}) {
  return (
    <View style={styles.bulletRow}>
      <View
        style={[
          styles.bulletDot,
          tone === 'warning' ? styles.bulletDotWarning : null,
        ]}
      />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function NumberedItem({
  index,
  children,
  styles,
}: {
  // Global index in the original action_steps[] (NOT post-slice). Callers that hide
  // the first action upstream MUST pass index+1 so the rendered label continues the
  // sequence (02., 03., …) instead of restarting at 01.
  index: number;
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  const label = String(safeIndex + 1).padStart(2, '0');
  return (
    <View style={styles.numberedRow}>
      <Text style={styles.numberedIndex}>
        {label}
        <Text style={styles.numberedIndexDot}>.</Text>
      </Text>
      <Text style={styles.numberedText}>{children}</Text>
    </View>
  );
}

function CheckedItem({
  children,
  styles,
  checkColor,
}: {
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
  checkColor: string;
}) {
  return (
    <View style={styles.checkedRow}>
      <View style={styles.checkedBullet}>
        <Check color={checkColor} size={12} strokeWidth={2.4} />
      </View>
      <Text style={styles.checkedText}>{children}</Text>
    </View>
  );
}

const createStyles = (
  colors: any,
  accentColor: string,
  paper: ReturnType<typeof getCoachPaperSurface>,
) =>
  StyleSheet.create({
    container: {
      gap: SPACING.md + 2,
      paddingTop: SPACING.xs,
    },
    summary: {
      fontSize: SIZES.text16,
      lineHeight: 26,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
    },
    section: {
      gap: SPACING.sm + 2,
    },
    sectionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    sectionLabel: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(accentColor, 0.85),
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    lead: {
      fontSize: SIZES.text16,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: paper.ink,
    },
    item: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
    },
    actionItem: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    note: {
      fontSize: 13,
      lineHeight: 20,
      fontStyle: 'italic',
      color: paper.inkMuted,
    },
    compoundItem: {
      gap: 4,
      paddingVertical: 4,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
      paddingTop: SPACING.xs,
    },
    chipText: {
      overflow: 'hidden',
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.medium,
      color: paper.inkMuted,
      backgroundColor: paper.raised,
      borderWidth: 0,
      letterSpacing: 0.3, borderCurve: 'continuous',
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    bulletDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: withAlpha(accentColor, 0.55),
      marginTop: 10,
      flexShrink: 0, borderCurve: 'continuous',
    },
    bulletDotWarning: {
      backgroundColor: withAlpha(colors.warning, 0.7),
    },
    bulletText: {
      flex: 1,
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
    },
    numberedRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 12,
    },
    numberedIndex: {
      fontSize: 13,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      color: withAlpha(accentColor, 0.85),
      letterSpacing: 0.4,
      minWidth: 20,
    },
    numberedIndexDot: {
      color: accentColor,
    },
    numberedText: {
      flex: 1,
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    checkedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    checkedBullet: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: withAlpha(accentColor, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 3,
      flexShrink: 0,
      borderCurve: 'continuous',
    },
    checkedText: {
      flex: 1,
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    warningSection: {
      backgroundColor: withAlpha(colors.warning, 0.05),
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      borderWidth: 0, borderCurve: 'continuous',
    },
    warningLabel: {
      color: withAlpha(colors.warning, 0.9),
    },
    encouragementRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: withAlpha(accentColor, 0.5),
      marginTop: SPACING.xs,
    },
    encouragementIcon: {
      marginTop: 5,
      flexShrink: 0,
    },
    encouragement: {
      flex: 1,
      fontSize: SIZES.text15,
      lineHeight: 24,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
    },
    summaryQuoteWrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: SPACING.md,
    },
    summaryQuoteRule: {
      width: 2,
      backgroundColor: withAlpha(accentColor, 0.55),
      borderRadius: 1, borderCurve: 'continuous',
    },
    summaryQuoteText: {
      flex: 1,
      fontSize: SIZES.text16,
      lineHeight: 26,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
    },
  });
