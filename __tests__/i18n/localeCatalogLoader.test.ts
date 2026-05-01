import {
  activateLocaleWithFallbacks,
  createLocaleCatalogLoader,
  type TranslationTreeLoader,
} from '@/i18n/internal/catalogLoader';
import type { LocaleCode } from '@/i18n/config';

function createLoaderMap(
  factory: (locale: LocaleCode) => TranslationTreeLoader,
): Record<LocaleCode, TranslationTreeLoader> {
  return {
    fr: factory('fr'),
    en: factory('en'),
    de: factory('de'),
    it: factory('it'),
    es: factory('es'),
    pt: factory('pt'),
  };
}

describe('localeCatalogLoader', () => {
  it('caches each loaded locale and avoids reloading the same catalogs', async () => {
    let baseCalls = 0;
    let overrideCalls = 0;
    const loader = createLocaleCatalogLoader({
      baseLoaders: createLoaderMap((locale) => async () => {
        baseCalls += 1;
        return { locale, common: { title: `base-${locale}` } };
      }),
      overrideLoaders: {
        fr: async () => {
          overrideCalls += 1;
          return { common: { results: { title: 'override-fr' } } };
        },
      },
    });

    const firstLoad = await loader.loadLocale('fr');
    const secondLoad = await loader.loadLocale('fr');

    expect(firstLoad).toBe(secondLoad);
    expect(baseCalls).toBe(1);
    expect(overrideCalls).toBe(1);
    expect(loader.isLoaded('fr')).toBe(true);
  });

  it('deduplicates concurrent requests for the same locale', async () => {
    let baseCalls = 0;
    let resolveBaseLoad!: (value: Record<string, unknown>) => void;
    const basePromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveBaseLoad = resolve;
    });
    const loader = createLocaleCatalogLoader({
      baseLoaders: createLoaderMap((locale) => async () => {
        baseCalls += 1;
        return locale === 'en'
          ? basePromise
          : { common: { title: `base-${locale}` } };
      }),
    });

    const firstLoad = loader.loadLocale('en');
    const secondLoad = loader.loadLocale('en');

    resolveBaseLoad({ common: { title: 'loaded-en' } });

    const [firstTree, secondTree] = await Promise.all([firstLoad, secondLoad]);

    expect(firstTree).toBe(secondTree);
    expect(baseCalls).toBe(1);
    expect(firstTree).toEqual({ common: { title: 'loaded-en' } });
  });

  it('merges base translations with authoritative result overrides', async () => {
    const loader = createLocaleCatalogLoader({
      baseLoaders: createLoaderMap(() => async () => ({
        common: {
          keep_me: 'base-value',
          results: {
            title: 'base-title',
            subtitle: 'base-subtitle',
          },
        },
        metric_card: {
          loading_value: '...',
        },
      })),
      overrideLoaders: {
        fr: async () => ({
          common: {
            results: {
              title: 'override-title',
            },
          },
          metric_card: {
            loading_value: 'override-loading-value',
            loading_label: 'override-loading-label',
          },
        }),
      },
    });

    const localeTree = await loader.loadLocale('fr');

    expect(localeTree).toEqual({
      common: {
        keep_me: 'base-value',
        results: {
          title: 'override-title',
        },
      },
      metric_card: {
        loading_value: 'override-loading-value',
        loading_label: 'override-loading-label',
      },
    });
  });

  it('falls back to the next locale candidate when activation fails', async () => {
    const activateLocale = jest
      .fn<Promise<unknown>, [LocaleCode]>()
      .mockRejectedValueOnce(new Error('de failed'))
      .mockResolvedValueOnce(undefined);

    const activeLocale = await activateLocaleWithFallbacks(activateLocale, [
      'de',
      'en',
      'fr',
    ]);

    expect(activeLocale).toBe('en');
    expect(activateLocale).toHaveBeenCalledTimes(2);
    expect(activateLocale).toHaveBeenNthCalledWith(1, 'de');
    expect(activateLocale).toHaveBeenNthCalledWith(2, 'en');
  });
});
