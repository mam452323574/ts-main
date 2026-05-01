import { Phase2HttpError } from './phase2Errors.ts';
import { getRevenueCatServerConfig, readOptionalServerEnv } from './phase2Env.ts';
import { isRecord } from './phase2Utils.ts';

type RevenueCatProfilePatch = {
  account_tier: 'free' | 'premium';
  subscription_status: 'active' | 'inactive' | 'canceled' | 'past_due' | 'expired';
  subscription_expiry_date: string | null;
  subscription_platform: 'ios' | 'android' | 'stripe' | 'web' | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readDate(value: unknown) {
  const parsed = readString(value);
  if (!parsed) {
    return null;
  }

  const timestamp = Date.parse(parsed);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function mapRevenueCatStoreToPlatform(
  value: unknown,
): RevenueCatProfilePatch['subscription_platform'] {
  const normalizedStore = readString(value)?.toLowerCase() ?? null;
  if (!normalizedStore) {
    return null;
  }

  if (
    normalizedStore.includes('app_store') ||
    normalizedStore.includes('ios') ||
    normalizedStore.includes('mac')
  ) {
    return 'ios';
  }

  if (
    normalizedStore.includes('play_store') ||
    normalizedStore.includes('google') ||
    normalizedStore.includes('android')
  ) {
    return 'android';
  }

  if (normalizedStore.includes('stripe')) {
    return 'stripe';
  }

  if (
    normalizedStore.includes('web') ||
    normalizedStore.includes('rc_billing')
  ) {
    return 'web';
  }

  return null;
}

function resolveRevenueCatSubscriber(
  payload: Record<string, unknown> | null,
) {
  if (!payload || !isRecord(payload.subscriber)) {
    return null;
  }

  return payload.subscriber;
}

function resolveRevenueCatEntitlement(
  subscriber: Record<string, unknown> | null,
  premiumEntitlementId: string,
) {
  if (!subscriber || !isRecord(subscriber.entitlements)) {
    return null;
  }

  const entitlements = subscriber.entitlements as Record<string, unknown>;
  if (isRecord(entitlements[premiumEntitlementId])) {
    return entitlements[premiumEntitlementId] as Record<string, unknown>;
  }

  for (const entitlement of Object.values(entitlements)) {
    if (isRecord(entitlement)) {
      return entitlement as Record<string, unknown>;
    }
  }

  return null;
}

function resolveRevenueCatSubscription(
  subscriber: Record<string, unknown> | null,
  productIdentifier: string | null,
) {
  if (!subscriber || !isRecord(subscriber.subscriptions)) {
    return null;
  }

  const subscriptions = subscriber.subscriptions as Record<string, unknown>;
  if (productIdentifier && isRecord(subscriptions[productIdentifier])) {
    return subscriptions[productIdentifier] as Record<string, unknown>;
  }

  let fallbackSubscription: Record<string, unknown> | null = null;
  let latestExpiry = -Infinity;

  for (const subscription of Object.values(subscriptions)) {
    if (!isRecord(subscription)) {
      continue;
    }

    const expiresAt = readDate(subscription.expires_date);
    const expiresTimestamp = expiresAt ? expiresAt.getTime() : Number.POSITIVE_INFINITY;
    if (!fallbackSubscription || expiresTimestamp > latestExpiry) {
      fallbackSubscription = subscription as Record<string, unknown>;
      latestExpiry = expiresTimestamp;
    }
  }

  return fallbackSubscription;
}

export function deriveRevenueCatProfilePatch(
  payload: Record<string, unknown> | null,
  now = new Date(),
) {
  const premiumEntitlementId =
    readOptionalServerEnv('REVENUECAT_PREMIUM_ENTITLEMENT_ID') ?? 'premium';
  const subscriber = resolveRevenueCatSubscriber(payload);
  const entitlement = resolveRevenueCatEntitlement(subscriber, premiumEntitlementId);
  const productIdentifier = readString(entitlement?.product_identifier);
  const subscription = resolveRevenueCatSubscription(subscriber, productIdentifier);

  const entitlementExpiry = readDate(entitlement?.expires_date);
  const subscriptionExpiry = readDate(subscription?.expires_date);
  const expiryDate = entitlementExpiry ?? subscriptionExpiry;
  const expiryIso = expiryDate ? expiryDate.toISOString() : null;
  const active = !expiryDate || expiryDate.getTime() > now.getTime();

  const billingIssuesDetectedAt =
    readDate(entitlement?.billing_issues_detected_at) ??
    readDate(subscription?.billing_issues_detected_at);
  const unsubscribeDetectedAt =
    readDate(entitlement?.unsubscribe_detected_at) ??
    readDate(subscription?.unsubscribe_detected_at);
  const platform =
    mapRevenueCatStoreToPlatform(entitlement?.store) ??
    mapRevenueCatStoreToPlatform(subscription?.store);

  if (!entitlement && !subscription) {
    return {
      account_tier: 'free',
      subscription_status: 'inactive',
      subscription_expiry_date: null,
      subscription_platform: null,
    } as RevenueCatProfilePatch;
  }

  if (active) {
    if (billingIssuesDetectedAt && billingIssuesDetectedAt.getTime() <= now.getTime()) {
      return {
        account_tier: 'premium',
        subscription_status: 'past_due',
        subscription_expiry_date: expiryIso,
        subscription_platform: platform,
      } as RevenueCatProfilePatch;
    }

    if (unsubscribeDetectedAt) {
      return {
        account_tier: 'premium',
        subscription_status: 'canceled',
        subscription_expiry_date: expiryIso,
        subscription_platform: platform,
      } as RevenueCatProfilePatch;
    }

    return {
      account_tier: 'premium',
      subscription_status: 'active',
      subscription_expiry_date: expiryIso,
      subscription_platform: platform,
    } as RevenueCatProfilePatch;
  }

  return {
    account_tier: 'free',
    subscription_status: expiryIso ? 'expired' : 'inactive',
    subscription_expiry_date: expiryIso,
    subscription_platform: platform,
  } as RevenueCatProfilePatch;
}

export async function fetchRevenueCatSubscriber(appUserId: string) {
  const config = getRevenueCatServerConfig();
  const response = await fetch(
    `${config.apiBaseUrl.replace(/\/+$/, '')}/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json; charset=utf-8',
      },
    },
  );

  const responseText = await response.text();
  let payload: Record<string, unknown> | null = null;

  if (responseText.trim().length > 0) {
    try {
      const parsed = JSON.parse(responseText);
      payload = isRecord(parsed) ? parsed : null;
    } catch {
      payload = null;
    }
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Phase2HttpError(
      502,
      'revenuecat_lookup_failed',
      'RevenueCat subscriber lookup failed',
      {
        status: response.status,
        response_body_present: responseText.trim().length > 0,
        provider_code: readString(payload?.code) ?? null,
      },
    );
  }

  return payload;
}

export async function syncRevenueCatSubscriptionForUser(
  client: any,
  userId: string,
  appUserId = userId,
) {
  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select(
      'id, account_tier, subscription_status, subscription_expiry_date, subscription_platform',
    )
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Phase2HttpError(
      404,
      'user_profile_not_found',
      'User profile not found for subscription sync',
    );
  }

  if (profile.account_tier === 'admin') {
    return {
      user_id: userId,
      app_user_id: appUserId,
      account_tier: 'admin',
      subscription_status:
        typeof profile.subscription_status === 'string' &&
        profile.subscription_status.length > 0
          ? profile.subscription_status
          : 'active',
      subscription_expiry_date: profile.subscription_expiry_date ?? null,
      subscription_platform: profile.subscription_platform ?? null,
    };
  }

  const subscriberPayload = await fetchRevenueCatSubscriber(appUserId);
  const nextProfilePatch = deriveRevenueCatProfilePatch(subscriberPayload);
  const updatePayload: Record<string, unknown> = {
    subscription_status: nextProfilePatch.subscription_status,
    subscription_expiry_date: nextProfilePatch.subscription_expiry_date,
    subscription_platform: nextProfilePatch.subscription_platform,
  };

  updatePayload.account_tier = nextProfilePatch.account_tier;

  const { error: updateError } = await client
    .from('user_profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (updateError) {
    throw new Phase2HttpError(
      500,
      'subscription_sync_failed',
      'Failed to persist synced subscription status',
    );
  }

  return {
    user_id: userId,
    app_user_id: appUserId,
    account_tier: nextProfilePatch.account_tier,
    subscription_status: nextProfilePatch.subscription_status,
    subscription_expiry_date: nextProfilePatch.subscription_expiry_date,
    subscription_platform: nextProfilePatch.subscription_platform,
  };
}

export function extractRevenueCatAppUserIds(payload: unknown) {
  const root = isRecord(payload) ? payload : null;
  const event = root && isRecord(root.event) ? root.event : root;
  if (!event) {
    return [];
  }

  const candidates = [
    readString(event.app_user_id),
    readString(event.original_app_user_id),
  ];

  if (Array.isArray(event.aliases)) {
    for (const alias of event.aliases) {
      candidates.push(readString(alias));
    }
  }

  const uniqueCandidates: string[] = [];
  for (const candidate of candidates) {
    if (candidate && !uniqueCandidates.includes(candidate)) {
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

export async function resolveRevenueCatUserIdFromWebhookPayload(
  client: any,
  payload: unknown,
) {
  const candidateIds = extractRevenueCatAppUserIds(payload).filter((value) =>
    UUID_PATTERN.test(value)
  );

  for (const candidateId of candidateIds) {
    const { data, error } = await client
      .from('user_profiles')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle();

    if (error) {
      throw new Phase2HttpError(
        500,
        'user_profile_lookup_failed',
        'Failed to match RevenueCat webhook payload to a user profile',
      );
    }

    if (data?.id) {
      return data.id as string;
    }
  }

  return null;
}
