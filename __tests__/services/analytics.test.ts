import Aptabase from '@aptabase/react-native';

import {
  resetAnalyticsForTests,
  trackEvent,
  trackFailureEvent,
} from '@/services/analytics';
import { resetRuntimeConfigForTests } from '@/services/runtimeConfig';

describe('analytics service', () => {
  const originalAppKey = process.env.EXPO_PUBLIC_APTABASE_APP_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetAnalyticsForTests();
    resetRuntimeConfigForTests();
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_APTABASE_APP_KEY = originalAppKey;
    resetRuntimeConfigForTests();
  });

  it('stays no-op when the Aptabase app key is missing', () => {
    delete process.env.EXPO_PUBLIC_APTABASE_APP_KEY;

    trackEvent('coach_opened');

    expect(Aptabase.init).not.toHaveBeenCalled();
    expect(Aptabase.trackEvent).not.toHaveBeenCalled();
  });

  it('initializes Aptabase once and tracks sanitized event properties', () => {
    process.env.EXPO_PUBLIC_APTABASE_APP_KEY = 'A-EU-123456789';

    trackEvent('entry_offer_shown', {
      offering_id: 'entry_offer',
      rollout: 100,
      eligible: true,
      ignored: null,
    });

    expect(Aptabase.init).toHaveBeenCalledTimes(1);
    expect(Aptabase.trackEvent).toHaveBeenCalledWith('entry_offer_shown', {
      offering_id: 'entry_offer',
      rollout: 100,
      eligible: true,
    });
  });

  it('tracks failure events without leaking sensitive metadata', () => {
    process.env.EXPO_PUBLIC_APTABASE_APP_KEY = 'A-EU-123456789';

    trackFailureEvent(
      'subscription_entitlement_sync_failed',
      {
        code: 'subscription_sync_failed',
        status: 502,
        requestId: 'req-123',
        responseBody: 'should-not-leak',
      },
      {
        source: 'auth_context',
        access_token: 'redacted',
      },
    );

    expect(Aptabase.trackEvent).toHaveBeenCalledWith(
      'subscription_entitlement_sync_failed',
      {
        source: 'auth_context',
        code: 'subscription_sync_failed',
        status: 502,
        request_id: 'req-123',
      },
    );
  });
});
