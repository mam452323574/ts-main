import { Platform } from 'react-native';

import { i18n, loadLocalesForTests } from '@/i18n/translations';
import { resolveEntryOfferOffering } from '@/services/revenueCatOfferings';

const mockLoadPurchasesModule = jest.fn();

jest.mock('@/services/purchasesRuntime', () => ({
  loadPurchasesModule: (...args: unknown[]) => mockLoadPurchasesModule(...args),
}));

function buildPackage(
  identifier: string,
  packageType: string,
  price: number,
  priceString: string,
  productIdentifier = `${identifier}-product`,
  extras: Record<string, unknown> = {},
) {
  return {
    identifier,
    packageType,
    product: {
      identifier: productIdentifier,
      title: `${packageType} Premium`,
      price,
      priceString,
      currencyCode: 'USD',
      ...extras,
    },
  };
}

function buildOfferings({
  current,
  all,
}: {
  current?: { identifier: string; availablePackages: any[]; metadata?: Record<string, unknown> } | null;
  all?: Record<string, { identifier: string; availablePackages: any[]; metadata?: Record<string, unknown> }>;
}) {
  return {
    current: current ?? null,
    all: all ?? {},
  };
}

function buildPurchasesModule(offerings: ReturnType<typeof buildOfferings>, extras: Record<string, unknown> = {}) {
  return {
    default: {
      getOfferings: jest.fn().mockResolvedValue(offerings),
      checkTrialOrIntroductoryPriceEligibility: jest.fn().mockResolvedValue({}),
      ...extras,
    },
  };
}

describe('resolveEntryOfferOffering', () => {
  const originalPlatform = Platform.OS;

  beforeAll(async () => {
    await loadLocalesForTests();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    i18n.locale = 'en';
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('prefers the metadata-selected package when an entry-offer package identifier is provided', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const selectedPackage = buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99');
    const fallbackPackage = buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99');
    const currentMonthly = buildPackage('$rc_monthly', 'MONTHLY', 15.99, '$15.99');

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [currentMonthly],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {
                entry_offer_package_identifier: '$rc_monthly',
              },
              availablePackages: [fallbackPackage, selectedPackage],
            },
          },
        }),
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.selectedPackage?.identifier).toBe('$rc_monthly');
    expect(result?.hasDiscount).toBe(true);
    expect(result?.discountPercentage).toBe(38);
    expect(result?.canShowPromo).toBe(true);
  });

  it('falls back to dashboard ordering when no metadata-selected package is configured', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const annualPackage = buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99');
    const monthlyPackage = buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99');
    const currentAnnual = buildPackage('$rc_annual', 'ANNUAL', 119.99, '$119.99');

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [currentAnnual],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {},
              availablePackages: [annualPackage, monthlyPackage],
            },
          },
        }),
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.selectedPackage?.identifier).toBe('$rc_annual');
    expect(result?.hasDiscount).toBe(true);
    expect(result?.canShowPromo).toBe(true);
  });

  it('returns a safe fallback when the requested offering does not exist', async () => {
    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: null,
          all: {},
        }),
      ),
    );

    const result = await resolveEntryOfferOffering('missing-offer');

    expect(result?.fallbackReason).toBe('offering_not_found');
    expect(result?.shouldFallbackToPaywall).toBe(false);
    expect(result?.canShowPromo).toBe(false);
  });

  it('resolves an iOS intro label only when RevenueCat reports eligibility', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });

    const monthlyPackage = buildPackage(
      '$rc_monthly',
      'MONTHLY',
      9.99,
      '$9.99',
      'monthly-product',
      {
        introPrice: {
          price: 0,
          priceString: '$0.00',
          periodNumberOfUnits: 3,
          periodUnit: 'day',
          cycles: 1,
        },
      },
    );

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {},
              availablePackages: [monthlyPackage],
            },
          },
        }),
        {
          checkTrialOrIntroductoryPriceEligibility: jest.fn().mockResolvedValue({
            'monthly-product': {
              status: 2,
            },
          }),
        },
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.introEligibility).toBe('eligible');
    expect(result?.hasIntro).toBe(true);
    expect(result?.introLabel).toBe('3 days free trial');
    expect(result?.canShowPromo).toBe(true);
  });

  it('falls back honestly on iOS when the intro offer exists but the user is ineligible', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });

    const monthlyPackage = buildPackage(
      '$rc_monthly',
      'MONTHLY',
      9.99,
      '$9.99',
      'monthly-product',
      {
        introPrice: {
          price: 0,
          priceString: '$0.00',
          periodNumberOfUnits: 3,
          periodUnit: 'day',
          cycles: 1,
        },
      },
    );

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99')],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {},
              availablePackages: [monthlyPackage],
            },
          },
        }),
        {
          checkTrialOrIntroductoryPriceEligibility: jest.fn().mockResolvedValue({
            'monthly-product': {
              status: 1,
            },
          }),
        },
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.introEligibility).toBe('ineligible');
    expect(result?.hasIntro).toBe(false);
    expect(result?.shouldFallbackToPaywall).toBe(true);
    expect(result?.fallbackReason).toBe('intro_ineligible');
  });

  it('parses Android free-trial phases with if-eligible messaging', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const monthlyPackage = buildPackage(
      '$rc_monthly',
      'MONTHLY',
      9.99,
      '$9.99',
      'monthly-product',
      {
        defaultOption: {
          freePhase: {
            billingPeriod: {
              value: 3,
              unit: 'day',
            },
          },
        },
      },
    );

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {},
              availablePackages: [monthlyPackage],
            },
          },
        }),
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.introEligibility).toBe('unknown');
    expect(result?.introLabel).toBe('3 days free trial if eligible');
    expect(result?.hasIntro).toBe(true);
    expect(result?.canShowPromo).toBe(true);
  });

  it('falls back when no intro or discount can be represented honestly', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const monthlyPackage = buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99');

    mockLoadPurchasesModule.mockResolvedValue(
      buildPurchasesModule(
        buildOfferings({
          current: {
            identifier: 'default',
            availablePackages: [buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99')],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              metadata: {},
              availablePackages: [monthlyPackage],
            },
          },
        }),
      ),
    );

    const result = await resolveEntryOfferOffering('entry-offer');

    expect(result?.hasDiscount).toBe(false);
    expect(result?.hasIntro).toBe(false);
    expect(result?.shouldFallbackToPaywall).toBe(true);
    expect(result?.fallbackReason).toBe('no_promotional_value');
  });
});
