import axios from 'axios';
import { authGatewayConfig } from '../../../config/ttlock.js';
import {
  displayNameFromJwtPayload,
  mergeGatewayJwtUserPayload,
  nipOrNimFromJwtPayload,
} from '../../../core/utils/jwtIdentityFromPayload.js';

/** Path relatif ke {@link authGatewayConfig.baseUrl} (mis. `/jwt/payload`). */
const JWT_PAYLOAD_PATH = process.env.AUTH_GATEWAY_JWT_PAYLOAD_PATH || '/jwt/payload';
const TIMEOUT_MS = Number(process.env.AUTH_GATEWAY_JWT_PAYLOAD_TIMEOUT_MS || '8000');

/**
 * Memanggil gateway auth **GET** `{base}{JWT_PAYLOAD_PATH}` (default **`/jwt/payload`**) dengan Bearer token request.
 * Base URL: `AUTH_GATEWAY_URL` (lihat [Auth API](https://dev-fri-gateway.virtualfri.id/api/documentation#/Authentication/)).
 * Mengambil `claims.name` dan `claims.nipnim` (bukan decode lokal / nested employee).
 *
 * @param {string} bearerToken Token mentah tanpa prefix "Bearer "
 * @returns {{ name: string, nipnim: string, status?: number, raw?: unknown, error?: string }}
 */
export async function fetchGatewayJwtPayloadClaims(bearerToken) {
  const empty = { name: '', nipnim: '' };
  if (!bearerToken || typeof bearerToken !== 'string') {
    return { ...empty, error: 'no_token' };
  }
  const token = bearerToken.trim();
  if (!token) {
    return { ...empty, error: 'no_token' };
  }

  const base = String(authGatewayConfig.baseUrl || '').replace(/\/+$/, '');
  if (!base) {
    return { ...empty, error: 'AUTH_GATEWAY_URL unset' };
  }

  const path = JWT_PAYLOAD_PATH.startsWith('/') ? JWT_PAYLOAD_PATH : `/${JWT_PAYLOAD_PATH}`;
  const url = `${base}${path}`;

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });

    const body = res.data;
    if (res.status < 200 || res.status >= 300) {
      return {
        ...empty,
        status: res.status,
        raw: body,
        error: `gateway_http_${res.status}`,
      };
    }

    const root =
      body && typeof body === 'object' && body.data != null && typeof body.data === 'object' && !Array.isArray(body.data)
        ? body.data
        : body;

    const claims =
      root && typeof root === 'object' && root.claims != null && typeof root.claims === 'object' && !Array.isArray(root.claims)
        ? root.claims
        : null;

    if (!claims) {
      return {
        ...empty,
        status: res.status,
        raw: body,
        error: 'no_claims_in_gateway_response',
      };
    }

    const merged = mergeGatewayJwtUserPayload({ ...claims, claims });
    const name = displayNameFromJwtPayload(merged);
    const nipnim = nipOrNimFromJwtPayload(merged);

    return { name, nipnim, status: res.status, raw: body };
  } catch (e) {
    const msg = e?.response?.data != null ? JSON.stringify(e.response.data).slice(0, 500) : e?.message || String(e);
    return { ...empty, error: msg };
  }
}
