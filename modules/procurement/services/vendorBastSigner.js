import { fetchGatewayJwtPayloadClaims } from './gatewayJwtPayloadService.js';
import {
  displayNameFromJwtPayload,
  nipOrNimFromJwtPayload,
} from '../../../core/utils/jwtIdentityFromPayload.js';

function bearerTokenFromReq(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/**
 * Display name + NIP for TPA/laboran generating vendor BAST.
 */
export async function resolveVendorBastSignerFromRequest(req) {
  const token = bearerTokenFromReq(req);
  const gw = await fetchGatewayJwtPayloadClaims(token);
  let name = gw.name ? String(gw.name).trim() : '';
  let nipnim = gw.nipnim ? String(gw.nipnim).trim() : '';

  if (!name || !nipnim) {
    const u = req.user && typeof req.user === 'object' ? req.user : {};
    if (!name) name = displayNameFromJwtPayload(u);
    if (!nipnim) nipnim = nipOrNimFromJwtPayload(u);
  }

  return { name: name || '—', nipnim: nipnim || '' };
}
