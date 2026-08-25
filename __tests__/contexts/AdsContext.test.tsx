import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

jest.unmock('@/contexts/AdsContext');

type RewardedListeners = {
  loaded?: (info: unknown) => void;
  loadFailed?: (info: unknown) => void;
  displayed?: (info: unknown) => void;
  failedToDisplay?: (info: unknown) => void;
  hidden?: (info: unknown) => void;
  reward?: (info: unknown) => void;
};

const mockLoadAdsModule = jest.fn();
const mockTrackEvent = jest.fn();
let mockSdkKey: string | null = 'sdk-key';
let mockRewardedAdUnitId: string | null = 'rewarded-ios';
let mockCanUseAds = true;
let mockIsAdReady = true;
let mockListeners: RewardedListeners = {};

const mockAppLovinMAX = {
  setTermsAndPrivacyPolicyFlowEnabled: jest.fn(),
  setPrivacyPolicyUrl: jest.fn(),
  setInitializationAdUnitIds: jest.fn(),
  initialize: jest.fn(async () => ({})),
};

const mockRewardedAd = {
  addAdLoadedEventListener: jest.fn((listener) => {
    mockListeners.loaded = listener;
  }),
  removeAdLoadedEventListener: jest.fn(() => {
    mockListeners.loaded = undefined;
  }),
  addAdLoadFailedEventListener: jest.fn((listener) => {
    mockListeners.loadFailed = listener;
  }),
  removeAdLoadFailedEventListener: jest.fn(() => {
    mockListeners.loadFailed = undefined;
  }),
  addAdDisplayedEventListener: jest.fn((listener) => {
    mockListeners.displayed = listener;
  }),
  removeAdDisplayedEventListener: jest.fn(() => {
    mockListeners.displayed = undefined;
  }),
  addAdFailedToDisplayEventListener: jest.fn((listener) => {
    mockListeners.failedToDisplay = listener;
  }),
  removeAdFailedToDisplayEventListener: jest.fn(() => {
    mockListeners.failedToDisplay = undefined;
  }),
  addAdHiddenEventListener: jest.fn((listener) => {
    mockListeners.hidden = listener;
  }),
  removeAdHiddenEventListener: jest.fn(() => {
    mockListeners.hidden = undefined;
  }),
  addAdReceivedRewardEventListener: jest.fn((listener) => {
    mockListeners.reward = listener;
  }),
  removeAdReceivedRewardEventListener: jest.fn(() => {
    mockListeners.reward = undefined;
  }),
  loadAd: jest.fn(),
  isAdReady: jest.fn(async () => mockIsAdReady),
  showAd: jest.fn(),
};

jest.mock('@/services/adsRuntime', () => ({
  loadAdsModule: (...args: unknown[]) => mockLoadAdsModule(...args),
}));

jest.mock('@/constants/ads', () => ({
  getAppLovinSdkKey: () => mockSdkKey,
  getRewardedAdUnitId: () => mockRewardedAdUnitId,
}));

jest.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

jest.mock('@/utils/runtimeCapabilities', () => ({
  getRuntimeCapabilities: () => ({
    platform: 'ios',
    appOwnership: 'standalone',
    isExpoGo: false,
    canUseNativePurchases: true,
    canUseLocalNotifications: true,
    canRegisterForPushNotifications: true,
    canUseAds: mockCanUseAds,
  }),
  logRuntimeDecision: jest.fn(),
  logRuntimeDecisionOnce: jest.fn(),
}));

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
}));

jest.mock('@/components/ads/RewardedAdOptInModal', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    RewardedAdOptInModal: ({
      visible,
      onClose,
      onWatch,
      onLater,
      onGoPremium,
    }: {
      visible: boolean;
      onClose: () => void;
      onWatch: () => void;
      onLater: () => void;
      onGoPremium: () => void;
    }) => {
      if (!visible) {
        return null;
      }

      return (
        <View testID="rewarded-optin">
          <Pressable
            testID="rewarded-optin-watch"
            onPress={() => {
              onClose();
              onWatch();
            }}
          >
            <Text>watch</Text>
          </Pressable>
          <Pressable
            testID="rewarded-optin-later"
            onPress={() => {
              onClose();
              onLater();
            }}
          >
            <Text>later</Text>
          </Pressable>
          <Pressable
            testID="rewarded-optin-premium"
            onPress={() => {
              onClose();
              onGoPremium();
            }}
          >
            <Text>premium</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const {
  AdsProvider,
  useAdsGate,
} = require('@/contexts/AdsContext') as typeof import('@/contexts/AdsContext');

function GateProbe() {
  const { isReady, presentRewardedAdGate } = useAdsGate();
  const [outcome, setOutcome] = useState('none');

  return (
    <View>
      <Text testID="ads-ready">{isReady ? 'ready' : 'not-ready'}</Text>
      <Text testID="ads-outcome">{outcome}</Text>
      <Pressable
        testID="ads-gate"
        onPress={() => {
          void presentRewardedAdGate('scan').then(setOutcome);
        }}
      >
        <Text>gate</Text>
      </Pressable>
    </View>
  );
}

function renderProvider() {
  return render(
    <AdsProvider>
      <GateProbe />
    </AdsProvider>,
  );
}

describe('AdsProvider AppLovin MAX rewarded gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSdkKey = 'sdk-key';
    mockRewardedAdUnitId = 'rewarded-ios';
    mockCanUseAds = true;
    mockIsAdReady = true;
    mockListeners = {};
    mockLoadAdsModule.mockResolvedValue({
      AppLovinMAX: mockAppLovinMAX,
      RewardedAd: mockRewardedAd,
    });
  });

  it('initializes AppLovin MAX and exposes ready after a rewarded ad load', async () => {
    renderProvider();

    await waitFor(() => {
      expect(mockAppLovinMAX.initialize).toHaveBeenCalledWith('sdk-key');
    });

    act(() => {
      mockListeners.loaded?.({ adUnitId: 'rewarded-ios' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('ads-ready').props.children).toBe('ready');
    });
    expect(mockAppLovinMAX.setInitializationAdUnitIds).toHaveBeenCalledWith([
      'rewarded-ios',
    ]);
    expect(mockRewardedAd.loadAd).toHaveBeenCalledWith('rewarded-ios');
  });

  it('resolves rewarded after the user watches and AppLovin sends a reward', async () => {
    renderProvider();

    await waitFor(() => {
      expect(mockRewardedAd.loadAd).toHaveBeenCalledWith('rewarded-ios');
    });
    act(() => {
      mockListeners.loaded?.({ adUnitId: 'rewarded-ios' });
    });

    fireEvent.press(screen.getByTestId('ads-gate'));
    await waitFor(() => {
      expect(screen.getByTestId('rewarded-optin')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('rewarded-optin-watch'));

    await waitFor(() => {
      expect(mockRewardedAd.showAd).toHaveBeenCalledWith(
        'rewarded-ios',
        'scan',
      );
    });

    act(() => {
      mockListeners.reward?.({ amount: 1 });
      mockListeners.hidden?.({ adUnitId: 'rewarded-ios' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('ads-outcome').props.children).toBe('rewarded');
    });
  });

  it('resolves skipped when the user declines the rewarded prompt', async () => {
    renderProvider();

    await waitFor(() => {
      expect(mockAppLovinMAX.initialize).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByTestId('ads-gate'));
    await waitFor(() => {
      expect(screen.getByTestId('rewarded-optin')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('rewarded-optin-later'));

    await waitFor(() => {
      expect(screen.getByTestId('ads-outcome').props.children).toBe('skipped');
    });
    expect(mockRewardedAd.showAd).not.toHaveBeenCalled();
  });

  it('fails open when AppLovin config is missing', async () => {
    mockSdkKey = null;

    renderProvider();

    fireEvent.press(screen.getByTestId('ads-gate'));

    await waitFor(() => {
      expect(screen.getByTestId('ads-outcome').props.children).toBe(
        'unavailable',
      );
    });
    expect(mockLoadAdsModule).not.toHaveBeenCalled();
  });

  it('fails open when a loaded ad is no longer ready at show time', async () => {
    mockIsAdReady = false;
    renderProvider();

    await waitFor(() => {
      expect(mockAppLovinMAX.initialize).toHaveBeenCalled();
    });
    act(() => {
      mockListeners.loadFailed?.({ message: 'load failed' });
    });

    fireEvent.press(screen.getByTestId('ads-gate'));
    await waitFor(() => {
      expect(screen.getByTestId('rewarded-optin')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('rewarded-optin-watch'));

    await waitFor(() => {
      expect(screen.getByTestId('ads-outcome').props.children).toBe(
        'unavailable',
      );
    });
    expect(mockRewardedAd.showAd).not.toHaveBeenCalled();
  });

  it('fails open when AppLovin cannot display the rewarded ad', async () => {
    renderProvider();

    await waitFor(() => {
      expect(mockRewardedAd.loadAd).toHaveBeenCalledWith('rewarded-ios');
    });
    act(() => {
      mockListeners.loaded?.({ adUnitId: 'rewarded-ios' });
    });

    fireEvent.press(screen.getByTestId('ads-gate'));
    await waitFor(() => {
      expect(screen.getByTestId('rewarded-optin')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('rewarded-optin-watch'));

    act(() => {
      mockListeners.failedToDisplay?.({ message: 'show failed' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('ads-outcome').props.children).toBe(
        'unavailable',
      );
    });
  });
});
