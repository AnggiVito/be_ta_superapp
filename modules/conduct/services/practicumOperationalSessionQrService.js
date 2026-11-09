import { conductDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { getOperationalSessionById } from './practicumOperationalSessionService.js';

export const OPERATIONAL_SESSION_QR_EXPIRY_SECONDS = 15;

function assertRequesterIsPic(session, requesterUserId, actionLabel) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (session.pic_user_id !== requesterUserId) {
    throw new Error(`Only the session PIC can ${actionLabel}`);
  }
}

async function assertCanGenerateAttendanceQr(session, requesterUserId) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (session.session_status !== 'ongoing') {
    throw new Error('Attendance QR can only be generated while the session is ongoing');
  }
  if (session.pic_user_id === requesterUserId) return;

  const activeAssistant = await conductDb.query(
    `SELECT 1
     FROM practicum_operational_session_active_assistants
     WHERE operational_session_id = $1::uuid
       AND user_id = $2
     LIMIT 1`,
    [session.id, requesterUserId]
  );
  if (activeAssistant.rowCount === 0) {
    throw new Error('Only the session PIC or an active assistant can generate the attendance QR');
  }
}

function buildQrPayload({ qrToken, operationalSessionId, expiredAt, assistantUserId }) {
  return {
    t: 'op_att',
    token: qrToken,
    sid: operationalSessionId,
    aid: assistantUserId,
    exp: expiredAt.toISOString(),
  };
}

function buildActivationQrPayload({ qrToken, operationalSessionId, expiredAt }) {
  return {
    token: qrToken,
    operationalSessionId,
    type: 'operational_session_assistant_activation',
    expiredAt: expiredAt.toISOString(),
  };
}

async function generateQrCodeImage(payload) {
  return QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 420,
    margin: 4,
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
  });
}

function computeRemainingSeconds(expiredAt) {
  const diff = Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
}

async function deactivateExpiredOperationalQrSessions(client, {
  operationalSessionId,
  generatedBy,
  attendanceOnly = false,
  activationOnly = false,
} = {}) {
  const params = [operationalSessionId];
  let query = `UPDATE practicum_operational_session_qr_sessions
     SET is_active = false, updated_at = NOW()
     WHERE operational_session_id = $1::uuid
       AND is_active = true
       AND expired_at <= NOW()`;

  if (generatedBy) {
    params.push(generatedBy);
    query += ` AND generated_by = $${params.length}`;
  }
  if (activationOnly) {
    query += ` AND qr_data->>'type' = 'operational_session_assistant_activation'`;
  } else if (attendanceOnly) {
    query += ` AND (qr_data->>'type' = 'operational_session_attendance' OR qr_data->>'t' = 'op_att')`;
  }

  await client.query(query, params);
}

async function toResponse(row) {
  const qrCodeImage = await generateQrCodeImage(row.qr_data);
  const remainingSeconds = computeRemainingSeconds(row.expired_at);

  return {
    sessionId: row.id,
    operationalSessionId: row.operational_session_id,
    qrToken: row.qr_token,
    generatedBy: row.generated_by,
    assistantUserId: row.generated_by,
    qrCodeImage,
    expiredAt: row.expired_at,
    expirySeconds: OPERATIONAL_SESSION_QR_EXPIRY_SECONDS,
    remainingSeconds,
    status: remainingSeconds > 0 ? 'active' : 'expired',
    generatedAt: row.created_at,
  };
}

export async function generateOperationalSessionActivationQr({ operationalSessionId, generatedBy }) {
  const session = await getOperationalSessionById(operationalSessionId);
  assertRequesterIsPic(session, generatedBy, 'generate the assistant activation QR');
  if (!['scheduled', 'ongoing'].includes(session.session_status)) {
    throw new Error('Assistant activation QR can only be generated while the session is scheduled or ongoing');
  }

  const qrToken = uuidv4();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + OPERATIONAL_SESSION_QR_EXPIRY_SECONDS * 1000);
  const qrPayload = buildActivationQrPayload({ qrToken, operationalSessionId, expiredAt });
  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    await deactivateExpiredOperationalQrSessions(client, {
      operationalSessionId,
      activationOnly: true,
    });
    await client.query(
      `UPDATE practicum_operational_session_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE operational_session_id = $1::uuid
         AND is_active = true
         AND qr_data->>'type' = 'operational_session_assistant_activation'`,
      [operationalSessionId]
    );

    const insertResult = await client.query(
      `INSERT INTO practicum_operational_session_qr_sessions (
         operational_session_id,
         qr_token,
         qr_data,
         generated_by,
         expired_at,
         is_active,
         created_at,
         updated_at
       ) VALUES ($1::uuid, $2, $3::jsonb, $4, $5, true, NOW(), NOW())
       RETURNING id, operational_session_id, qr_token, qr_data, generated_by, expired_at, created_at`,
      [operationalSessionId, qrToken, JSON.stringify(qrPayload), generatedBy, expiredAt]
    );

    await client.query('COMMIT');
    return toResponse(insertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to generate operational session activation QR', {
      operationalSessionId,
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function generateOperationalSessionQr({ operationalSessionId, generatedBy }) {
  const session = await getOperationalSessionById(operationalSessionId);
  await assertCanGenerateAttendanceQr(session, generatedBy);

  const qrToken = uuidv4();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + OPERATIONAL_SESSION_QR_EXPIRY_SECONDS * 1000);
  const qrPayload = buildQrPayload({
    qrToken,
    operationalSessionId,
    expiredAt,
    assistantUserId: generatedBy,
  });

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    await deactivateExpiredOperationalQrSessions(client, {
      operationalSessionId,
      generatedBy,
      attendanceOnly: true,
    });
    await client.query(
      `UPDATE practicum_operational_session_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE operational_session_id = $1::uuid
         AND generated_by = $2
         AND is_active = true
         AND (qr_data->>'type' = 'operational_session_attendance' OR qr_data->>'t' = 'op_att')`,
      [operationalSessionId, generatedBy]
    );

    const insertResult = await client.query(
      `INSERT INTO practicum_operational_session_qr_sessions (
         operational_session_id,
         qr_token,
         qr_data,
         generated_by,
         expired_at,
         is_active,
         created_at,
         updated_at
       ) VALUES ($1::uuid, $2, $3::jsonb, $4, $5, true, NOW(), NOW())
       RETURNING id, operational_session_id, qr_token, qr_data, generated_by, expired_at, created_at`,
      [operationalSessionId, qrToken, JSON.stringify(qrPayload), generatedBy, expiredAt]
    );

    await client.query('COMMIT');
    logger.info('Operational session QR generated', {
      operationalSessionId,
      sessionId: insertResult.rows[0]?.id,
      expiredAt,
    });
    return toResponse(insertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to generate operational session QR', {
      operationalSessionId,
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveOperationalSessionQr({ operationalSessionId, requesterUserId }) {
  const session = await getOperationalSessionById(operationalSessionId);
  await assertCanGenerateAttendanceQr(session, requesterUserId);

  const result = await conductDb.query(
    `SELECT id, operational_session_id, qr_token, qr_data, generated_by, expired_at, created_at
     FROM practicum_operational_session_qr_sessions
     WHERE operational_session_id = $1::uuid
       AND generated_by = $2
       AND is_active = true
       AND (qr_data->>'type' = 'operational_session_attendance' OR qr_data->>'t' = 'op_att')
       AND expired_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [operationalSessionId, requesterUserId]
  );

  if (result.rowCount === 0) {
    throw new Error('Active attendance QR was not found or has expired');
  }

  return toResponse(result.rows[0]);
}

async function validateTypedOperationalSessionQrToken({ operationalSessionId, qrToken, type }) {
  const shortType = type === 'operational_session_attendance'
    ? 'op_att'
    : type === 'operational_session_assistant_activation'
      ? 'op_act'
      : type;
  const result = await conductDb.query(
    `SELECT id, operational_session_id, qr_token, qr_data, generated_by, expired_at, is_active
     FROM practicum_operational_session_qr_sessions
     WHERE operational_session_id = $1::uuid
       AND qr_token = $2
       AND (qr_data->>'type' = $3 OR qr_data->>'t' = $4)
     LIMIT 1`,
    [operationalSessionId, qrToken, type, shortType]
  );

  if (result.rowCount === 0) throw new Error('QR token was not found');
  const qrSession = result.rows[0];
  if (!qrSession.is_active) throw new Error('QR token is no longer active');
  if (new Date(qrSession.expired_at).getTime() <= Date.now()) {
    await conductDb.query(
      `UPDATE practicum_operational_session_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [qrSession.id]
    );
    throw new Error('QR token has expired');
  }
  return qrSession;
}

export async function validateOperationalSessionActivationQrToken({ operationalSessionId, qrToken }) {
  return validateTypedOperationalSessionQrToken({
    operationalSessionId,
    qrToken,
    type: 'operational_session_assistant_activation',
  });
}

export async function validateOperationalSessionQrToken({ operationalSessionId, qrToken }) {
  return validateTypedOperationalSessionQrToken({
    operationalSessionId,
    qrToken,
    type: 'operational_session_attendance',
  });
}
