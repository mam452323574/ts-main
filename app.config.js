const { expo: baseExpo } = require('./app.json');
const applovinSkAdNetworkIds = require('./config/applovinSkAdNetworkIds.json');

const DEV_CLIENT_PLUGIN = 'expo-dev-client';

function getPluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

function isDevelopmentClientBuild() {
  return (
    process.env.EAS_BUILD_PROFILE === 'development' ||
    process.env.SELFLENS_ENABLE_DEV_CLIENT === '1'
  );
}

function withoutDevelopmentClient(plugins = []) {
  return plugins.filter((plugin) => getPluginName(plugin) !== DEV_CLIENT_PLUGIN);
}

function readSkAdNetworkIdentifier(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const identifier = item.SKAdNetworkIdentifier;
  return typeof identifier === 'string' && identifier.trim().length > 0
    ? identifier.trim()
    : null;
}

function mergeSkAdNetworkItems(existingItems = []) {
  const identifiers = new Set();

  for (const item of existingItems) {
    const identifier = readSkAdNetworkIdentifier(item);
    if (identifier) {
      identifiers.add(identifier);
    }
  }

  for (const identifier of applovinSkAdNetworkIds) {
    if (typeof identifier === 'string' && identifier.trim().length > 0) {
      identifiers.add(identifier.trim());
    }
  }

  return Array.from(identifiers)
    .sort()
    .map((identifier) => ({ SKAdNetworkIdentifier: identifier }));
}

function getProductionInfoPlist(infoPlist = {}) {
  return {
    ...infoPlist,
    NSAppTransportSecurity: {
      ...(infoPlist.NSAppTransportSecurity ?? {}),
      NSAllowsArbitraryLoads: false,
    },
    SKAdNetworkItems: mergeSkAdNetworkItems(infoPlist.SKAdNetworkItems),
  };
}

function readEnvOrBaseExtra(key) {
  const envValue = process.env[key];
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim();
  }

  return baseExpo.extra?.[key] ?? '';
}

function getExpoExtra() {
  return {
    ...baseExpo.extra,
    EXPO_PUBLIC_APPLOVIN_SDK_KEY: readEnvOrBaseExtra('EXPO_PUBLIC_APPLOVIN_SDK_KEY'),
    EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED: readEnvOrBaseExtra(
      'EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED',
    ),
    EXPO_PUBLIC_APPLOVIN_IOS_REWARDED: readEnvOrBaseExtra(
      'EXPO_PUBLIC_APPLOVIN_IOS_REWARDED',
    ),
  };
}

module.exports = ({ config }) => {
  const developmentClientBuild = isDevelopmentClientBuild();

  return {
    ...config,
    ...baseExpo,
    plugins: developmentClientBuild
      ? baseExpo.plugins
      : withoutDevelopmentClient(baseExpo.plugins),
    ios: {
      ...baseExpo.ios,
      infoPlist: developmentClientBuild
        ? baseExpo.ios?.infoPlist
        : getProductionInfoPlist(baseExpo.ios?.infoPlist),
    },
    extra: getExpoExtra(),
  };
};
