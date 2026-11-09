import { loadEnvSafe } from '../core/utils/envLoader.js';

// Load environment variables (tidak override yang sudah di-set dari Docker)
loadEnvSafe();

export const ttlockConfig = {
  apiUrl: process.env.TTLOCK_BASE_URL || 'https://euapi.ttlock.com',
  clientId: process.env.TTLOCK_CLIENT_ID || '',
  clientSecret: process.env.TTLOCK_CLIENT_SECRET || '',
  username: process.env.TTLOCK_USERNAME || '',
  password: process.env.TTLOCK_PASSWORD || '',
};

/** Auth / SSO gateway (login, JWT payload, …). Swagger: https://dev-fri-gateway.virtualfri.id/api/documentation#/Authentication/ */
export const authGatewayConfig = {
  baseUrl: process.env.AUTH_GATEWAY_URL || 'https://dev-fri-gateway.virtualfri.id',
};

