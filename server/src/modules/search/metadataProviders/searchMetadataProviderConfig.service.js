import { env } from '../../../config/env.js';
import {
  DISCOVERY_PROVIDERS,
  getDiscoveryProviderSecret,
  isDiscoverySecretManagementConfigured,
} from '../discoveryProviderSecretsVault.service.js';

const ENV_KEY_MAP = Object.freeze({
  [DISCOVERY_PROVIDERS.SERPER]: {
    apiKey: 'SERPER_API_KEY',
    baseUrl: 'SERPER_BASE_URL',
  },
  [DISCOVERY_PROVIDERS.SERPAPI]: {
    apiKey: 'SERPAPI_API_KEY',
    baseUrl: 'SERPAPI_BASE_URL',
  },
  [DISCOVERY_PROVIDERS.GOOGLE_PLACES]: {
    apiKey: 'GOOGLE_PLACES_API_KEY',
    baseUrl: null,
  },
});

export const getResolvedDiscoveryProviderConfig = async (provider) => {
  if (isDiscoverySecretManagementConfigured()) {
    const dashboard = await getDiscoveryProviderSecret(provider);
    if (dashboard) {
      return {
        provider,
        apiKey: dashboard.apiKey,
        baseUrl: dashboard.baseUrl,
        source: 'dashboard',
        fingerprint: dashboard.fingerprint,
      };
    }
  }

  const envKeys = ENV_KEY_MAP[provider];
  const apiKey = envKeys?.apiKey ? env[envKeys.apiKey] : null;
  const baseUrl = envKeys?.baseUrl ? env[envKeys.baseUrl] : null;

  return {
    provider,
    apiKey: apiKey || null,
    baseUrl: baseUrl || null,
    source: apiKey ? 'env' : 'missing',
    fingerprint: null,
  };
};

export const getResolvedSearchMetadataProviderConfig = getResolvedDiscoveryProviderConfig;
export const getResolvedGooglePlacesConfig = () => getResolvedDiscoveryProviderConfig(DISCOVERY_PROVIDERS.GOOGLE_PLACES);

export const getProviderConfiguredSource = async (provider) => {
  const config = await getResolvedDiscoveryProviderConfig(provider);
  return config.source;
};
