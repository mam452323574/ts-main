const loadExpoConfig = require('../../app.config.js');

const originalProfile = process.env.EAS_BUILD_PROFILE;
const originalDevClientOverride = process.env.SELFLENS_ENABLE_DEV_CLIENT;

function getPluginNames(config: any): string[] {
  return (config.plugins ?? []).map((plugin: string | [string, unknown]) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  );
}

describe('Expo production config hygiene', () => {
  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.EAS_BUILD_PROFILE;
    } else {
      process.env.EAS_BUILD_PROFILE = originalProfile;
    }

    if (originalDevClientOverride === undefined) {
      delete process.env.SELFLENS_ENABLE_DEV_CLIENT;
    } else {
      process.env.SELFLENS_ENABLE_DEV_CLIENT = originalDevClientOverride;
    }
  });

  it('removes dev client and arbitrary ATS loads from production builds', () => {
    process.env.EAS_BUILD_PROFILE = 'production-ios';
    delete process.env.SELFLENS_ENABLE_DEV_CLIENT;

    const config = loadExpoConfig({ config: {} });

    expect(getPluginNames(config)).not.toContain('expo-dev-client');
    expect(config.ios.infoPlist.NSAppTransportSecurity).toEqual(
      expect.objectContaining({
        NSAllowsArbitraryLoads: false,
      }),
    );
    expect(config.ios.infoPlist.SKAdNetworkItems).toEqual(
      expect.arrayContaining([
        { SKAdNetworkIdentifier: 'ludvb6z3bs.skadnetwork' },
        { SKAdNetworkIdentifier: '22mmun2rn5.skadnetwork' },
      ]),
    );
  });

  it('keeps dev client available for the development profile only', () => {
    process.env.EAS_BUILD_PROFILE = 'development';

    const config = loadExpoConfig({ config: {} });

    expect(getPluginNames(config)).toContain('expo-dev-client');
  });
});
