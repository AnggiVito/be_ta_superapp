import axios from 'axios';
import { logger } from '../utils/logger.js';

const AUTH_GATEWAY_URL =
  process.env.AUTH_GATEWAY_URL || 'https://dev-fri-gateway.virtualfri.id';

const authClient = axios.create({
  baseURL: AUTH_GATEWAY_URL,
  timeout: 30000,
  validateStatus: () => true,
});

function forwardAuthResponse(res, gatewayRes) {
  res.status(gatewayRes.status).json(gatewayRes.data);
}

function handleProxyError(res, err, action) {
  logger.error(`Auth gateway proxy ${action} failed`, {
    message: err.message,
    code: err.code,
  });
  res.status(502).json({
    success: false,
    error: 'Auth gateway unavailable',
    message: 'Auth gateway unavailable',
  });
}

/**
 * Same-origin auth proxy for local Flutter web (avoids browser CORS to dev-fri-gateway).
 */
export function registerAuthGatewayProxy(app) {
  app.post('/login', async (req, res) => {
    try {
      const gatewayRes = await authClient.post('/login', req.body ?? {});
      forwardAuthResponse(res, gatewayRes);
    } catch (err) {
      handleProxyError(res, err, 'login');
    }
  });

  app.post('/logout', async (req, res) => {
    try {
      const headers = {};
      const auth = req.get('authorization');
      if (auth) headers.Authorization = auth;
      const gatewayRes = await authClient.post('/logout', req.body ?? {}, { headers });
      forwardAuthResponse(res, gatewayRes);
    } catch (err) {
      handleProxyError(res, err, 'logout');
    }
  });

  app.get('/me', async (req, res) => {
    try {
      const headers = {};
      const auth = req.get('authorization');
      if (auth) headers.Authorization = auth;
      const gatewayRes = await authClient.get('/me', { headers });
      forwardAuthResponse(res, gatewayRes);
    } catch (err) {
      handleProxyError(res, err, 'me');
    }
  });
}
