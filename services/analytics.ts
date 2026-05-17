import Aptabase from '@aptabase/react-native';
import { getRuntimeConfig } from './runtimeConfig';
import {
  getSafeErrorTelemetry,
  sanitizeObservabilityProperties,
  type SafeObservabilityProperties,
} from '@/utils/observability';

export type AnalyticsEventName =
  | 'social_tab_viewed'
  | 'social_post_started'
  | 'social_post_published'
  | 'social_post_rejected'
  | 'social_post_reaction_failed'
  | 'social_comment_created'
  | 'social_comment_rejected'
  | 'social_report_submitted'
  | 'moderation_report_submission_failed'
  | 'social_post_delete_failed'
  | 'social_upload_failed'
  | 'social_share_failed'
  | 'social_follow_author_failed'
  | 'social_author_follow_toggled'
  | 'social_hide_author_failed'
  | 'social_author_hide_toggled'
  | 'social_post_save_toggled'
  | 'social_post_save_failed'
  | 'coach_opened'
  | 'coach_premium_unlock_tapped'
  | 'coach_persona_locked_tapped'
  | 'coach_persona_selected'
  | 'coach_persona_update_failed'
  | 'coach_generation_locked_persona_blocked'
  | 'coach_prompt_blocked_no_scans'
  | 'coach_prompt_blocked_quota_unavailable'
  | 'coach_prompt_blocked_quota_exhausted'
  | 'coach_scan_result_auto_submit_started'
  | 'coach_prompt_submitted'
  | 'coach_response_received'
  | 'coach_generation_failed'
  | 'entry_offer_shown'
  | 'entry_offer_spin'
  | 'entry_offer_result'
  | 'entry_offer_dismissed'
  | 'entry_offer_paywall_open'
  | 'entry_offer_purchase_attempt'
  | 'entry_offer_purchase_completed'
  | 'subscription_purchase_failed'
  | 'subscription_restore_failed'
  | 'subscription_entitlement_sync_failed';

export type AnalyticsProperties = SafeObservabilityProperties;

let analyticsInitialized = false;

function sanitizeProperties(properties?: AnalyticsProperties) {
  return sanitizeObservabilityProperties(properties);
}

function initializeAnalyticsIfNeeded() {
  if (analyticsInitialized) {
    return true;
  }

  const { aptabaseAppKey, aptabaseHost } = getRuntimeConfig();
  const appKey = aptabaseAppKey?.trim();
  if (!appKey) {
    return false;
  }

  try {
    Aptabase.init(appKey, {
      host: aptabaseHost?.trim() || undefined,
    });
    analyticsInitialized = true;
    return true;
  } catch (error) {
    console.warn(
      '[Analytics] Failed to initialize Aptabase:',
      sanitizeProperties(getSafeErrorTelemetry(error)),
    );
    return false;
  }
}

export function trackEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
) {
  if (!initializeAnalyticsIfNeeded()) {
    return;
  }

  try {
    Aptabase.trackEvent(eventName, sanitizeProperties(properties));
  } catch (error) {
    console.warn(`[Analytics] Failed to track "${eventName}":`, {
      ...sanitizeProperties(getSafeErrorTelemetry(error)),
      event_name: eventName,
    });
  }
}

export function trackFailureEvent(
  eventName: AnalyticsEventName,
  error: unknown,
  properties?: AnalyticsProperties,
) {
  trackEvent(eventName, {
    ...properties,
    ...getSafeErrorTelemetry(error),
  });
}

export function resetAnalyticsForTests() {
  analyticsInitialized = false;
}
