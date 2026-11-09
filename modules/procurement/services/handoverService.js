import { ethers } from 'ethers';
import { procurementDb } from '../../../config/databases.js';
import * as submissionSvc from './submissionService.js';

export const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'confirmHandoverWithSig',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'submissionId', type: 'uint256' },
      { name: 'studentIdHash', type: 'bytes32' },
      { name: 'itemsHash', type: 'bytes32' },
      { name: 'status', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'getHandoverProof',
    stateMutability: 'view',
    inputs: [{ name: 'submissionId', type: 'uint256' }],
    outputs: [
      {
        name: 'proof',
        type: 'tuple',
        components: [
          { name: 'submissionId', type: 'uint256' },
          { name: 'studentIdHash', type: 'bytes32' },
          { name: 'laboranWallet', type: 'address' },
          { name: 'status', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'itemsHash', type: 'bytes32' },
          { name: 'confirmed', type: 'bool' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'isHandoverConfirmed',
    stateMutability: 'view',
    inputs: [{ name: 'submissionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'authorizeLaboran',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'laboran', type: 'address' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'authorizedLaboran',
    stateMutability: 'view',
    inputs: [{ name: 'laboran', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'revokeLaboran',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'laboran', type: 'address' }],
    outputs: []
  },
  {
    type: 'event',
    name: 'HandoverConfirmed',
    anonymous: false,
    inputs: [
      { name: 'submissionId', type: 'uint256', indexed: true },
      { name: 'studentIdHash', type: 'bytes32', indexed: false },
      { name: 'laboranWallet', type: 'address', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'LaboranAuthorized',
    anonymous: false,
    inputs: [
      { name: 'laboran', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'LaboranRevoked',
    anonymous: false,
    inputs: [
      { name: 'laboran', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false }
    ]
  }
];

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x7fb84aFf1311A8bc93751d1AA805e7904903ACFa';
const RPC_URL = process.env.RPC_URL || 'https://rpc.sepolia.org';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.HANDOVER_CHAIN_ID || 11155111);
const DEFAULT_LABORAN_WALLET = normalizeWallet(
  process.env.DEFAULT_LABORAN_WALLET || '0x24dd09681D0545C84AEc89D42CF645f6c1694939'
);

function nowUtc() {
  return new Date();
}

function normalizeWallet(address) {
  if (!address) return '';
  try {
    return ethers.getAddress(String(address));
  } catch (_) {
    return String(address).toLowerCase();
  }
}

function hashConfirmationCode(code) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(code)));
}

function generateConfirmationCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateNonce() {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
}

function parseJsonMaybe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function getSubmissionHandoverRow(submissionId) {
  const q = `
    SELECT
      s.id AS submission_id,
      s.requester_id,
      s.requester_name,
      s.status AS submission_status,
      COALESCE(json_agg(json_build_object(
        'id', i.id,
        'item_name', i.item_name,
        'specification', i.specification,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'total_price', i.total_price
      ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM procurement_submission s
    LEFT JOIN procurement_submission_items i ON i.submission_id = s.id
    WHERE s.id = $1
    GROUP BY s.id
  `;
  const { rows } = await procurementDb.query(q, [submissionId]);
  return rows[0] || null;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function computeItemsHash(items) {
  const normalized = [...(items || [])]
    .map(item => ({
      id: Number(item.id),
      item_name: item.item_name ?? '',
      quantity: Number(item.quantity ?? 0),
      specification: item.specification ?? '',
      total_price: Number(item.total_price ?? 0),
      unit_price: Number(item.unit_price ?? 0)
    }))
    .sort((a, b) => a.id - b.id)
    .map(sortObjectKeys);
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(normalized)));
}

function resolveStudentIdentity(req) {
  const user = req.user || {};
  const raw = user.student_id || user.nim || user.nim_number || user.username || user.email || user.id;
  return String(raw ?? '');
}

function buildTypedData(submissionId, studentIdHash, itemsHash, nonce, timestampSeconds) {
  return {
    domain: {
      name: 'LabHandover',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT_ADDRESS
    },
    types: {
      Handover: [
        { name: 'submissionId', type: 'uint256' },
        { name: 'studentIdHash', type: 'bytes32' },
        { name: 'itemsHash', type: 'bytes32' },
        { name: 'status', type: 'string' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
      ]
    },
    primaryType: 'Handover',
    message: {
      submissionId: BigInt(submissionId).toString(),
      studentIdHash,
      itemsHash,
      status: 'COMPLETED',
      timestamp: Number(timestampSeconds),
      nonce: nonce.toString()
    }
  };
}

export async function confirmReceipt(req, submissionId) {
  const row = await getSubmissionHandoverRow(submissionId);
  if (!row) {
    const err = new Error('Submission not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (String(row.requester_id) !== String(req.user?.id)) {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const items = parseJsonMaybe(row.items, []);
  const itemsHash = computeItemsHash(items);
  const studentId = resolveStudentIdentity(req);
  const studentIdHash = ethers.keccak256(ethers.toUtf8Bytes(studentId));
  const code = generateConfirmationCode();
  const codeExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

  const existing = await procurementDb.query(
    'SELECT id FROM procurement_handover_sessions WHERE submission_id = $1',
    [submissionId]
  );

  const payload = {
    studentIdHash,
    itemsHash,
    confirmationCodeHash: hashConfirmationCode(code),
    confirmationCodeExpiresAt: codeExpiresAt,
    studentConfirmedAt: nowUtc(),
    studentUserId: String(req.user?.id ?? ''),
    studentIp: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
    status: 'WAITING_VERIFICATION',
    updated_at: nowUtc()
  };

  if (existing.rowCount > 0) {
    const { rows } = await procurementDb.query(
      `UPDATE procurement_handover_sessions
       SET student_id_hash = $1,
           items_hash = $2,
           confirmation_code_hash = $3,
           confirmation_code_expires_at = $4,
           student_confirmed_at = $5,
           student_user_id = $6,
           student_ip = $7,
           status = $8,
           updated_at = now()
       WHERE submission_id = $9
       RETURNING *`,
      [payload.studentIdHash, payload.itemsHash, payload.confirmationCodeHash, payload.confirmationCodeExpiresAt, payload.studentConfirmedAt, payload.studentUserId, payload.studentIp, payload.status, submissionId]
    );
    return { session: rows[0], code, itemsHash, studentIdHash };
  }

  const { rows } = await procurementDb.query(
    `INSERT INTO procurement_handover_sessions (
      submission_id, student_id_hash, items_hash, student_confirmed_at, student_user_id, student_ip,
      confirmation_code_hash, confirmation_code_expires_at, status, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
    RETURNING *`,
    [submissionId, payload.studentIdHash, payload.itemsHash, payload.studentConfirmedAt, payload.studentUserId, payload.studentIp, payload.confirmationCodeHash, payload.confirmationCodeExpiresAt, payload.status]
  );
  return { session: rows[0], code, itemsHash, studentIdHash };
}

export async function verifyConfirmationCode(req, submissionId, code) {
  const { rows } = await procurementDb.query(
    'SELECT * FROM procurement_handover_sessions WHERE submission_id = $1',
    [submissionId]
  );
  const session = rows[0];
  if (!session) {
    const err = new Error('Handover session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (session.status !== 'WAITING_VERIFICATION') {
    const err = new Error('Handover session is not waiting for verification');
    err.code = 'INVALID_STATE';
    throw err;
  }
  if (!session.confirmation_code_hash || !session.confirmation_code_expires_at) {
    const err = new Error('Confirmation code is missing');
    err.code = 'INVALID_CODE';
    throw err;
  }
  if (new Date(session.confirmation_code_expires_at).getTime() < Date.now()) {
    const err = new Error('Confirmation code expired');
    err.code = 'EXPIRED_CODE';
    throw err;
  }
  if (hashConfirmationCode(code) !== session.confirmation_code_hash) {
    const err = new Error('Invalid confirmation code');
    err.code = 'INVALID_CODE';
    throw err;
  }

  const studentIdHash = session.student_id_hash;
  const itemsHash = session.items_hash;
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = buildTypedData(submissionId, studentIdHash, itemsHash, nonce, timestamp);

  const { rows: updated } = await procurementDb.query(
    `UPDATE procurement_handover_sessions
     SET confirmation_code_verified_at = now(),
         nonce = $1,
         typed_timestamp = $2,
         eip712_payload = $3,
         status = $4,
         updated_at = now()
     WHERE submission_id = $5
     RETURNING *`,
    [nonce.toString(), timestamp, payload, 'CODE_VERIFIED', submissionId]
  );

  return { session: updated[0], payload };
}

async function getRelayer() {
  if (!RELAYER_PRIVATE_KEY || !CONTRACT_ADDRESS || !RPC_URL) {
    const err = new Error('Relayer environment is incomplete');
    err.code = 'RELAYER_NOT_CONFIGURED';
    throw err;
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  return { provider, wallet, contract };
}

async function ensureLaboranAuthorizedOnChain(contract, laboranWallet) {
  const normalized = normalizeWallet(laboranWallet);
  if (!normalized) return false;

  let isAuthorized = false;
  try {
    isAuthorized = await contract.authorizedLaboran(normalized);
  } catch (error) {
    console.warn('[handover:chainAuthorize] authorizedLaboran check failed, will try to authorize directly', {
      wallet: normalized,
      error: error?.message || String(error)
    });
  }

  if (isAuthorized) return false;

  const tx = await contract.authorizeLaboran(normalized);
  await tx.wait();
  console.log('[handover:chainAuthorize] laboran authorized on-chain', {
    wallet: normalized,
    txHash: tx.hash
  });
  return true;
}

export async function submitSignature(req, submissionId, signature, laboranWallet) {
  const { rows } = await procurementDb.query(
    'SELECT * FROM procurement_handover_sessions WHERE submission_id = $1',
    [submissionId]
  );
  const session = rows[0];
  if (!session) {
    const err = new Error('Handover session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (session.status !== 'CODE_VERIFIED') {
    const err = new Error('Handover session is not ready for signature submission');
    err.code = 'INVALID_STATE';
    throw err;
  }
  if (!session.eip712_payload || !session.nonce) {
    const err = new Error('Typed payload is missing');
    err.code = 'INVALID_STATE';
    throw err;
  }

  const payload = parseJsonMaybe(session.eip712_payload, null);
  if (!payload) {
    const err = new Error('Typed payload is invalid');
    err.code = 'INVALID_STATE';
    throw err;
  }

  const requestedWallet = normalizeWallet(laboranWallet || '');
  const resolvedWallet = requestedWallet || DEFAULT_LABORAN_WALLET;
  const recovered = ethers.verifyTypedData(
    payload.domain,
    payload.types,
    payload.message,
    signature
  );

  console.log('[handover:submitSignature]', {
    submissionId: String(submissionId),
    requestedLaboranWallet: requestedWallet,
    resolvedWallet,
    recovered: normalizeWallet(recovered),
    defaultLaboranWallet: DEFAULT_LABORAN_WALLET,
    payloadTimestamp: payload?.message?.timestamp ?? null,
    payloadNonce: payload?.message?.nonce ?? null
  });

  if (requestedWallet && normalizeWallet(recovered) !== requestedWallet) {
    console.warn('[handover:submitSignature] requested wallet does not match recovered signer; continuing with recovered wallet', {
      submissionId: String(submissionId),
      requestedWallet,
      recovered: normalizeWallet(recovered)
    });
  }

  const dbWallet = normalizeWallet(recovered);
  const walletCheck = await procurementDb.query(
    `SELECT wallet_address, is_active, revoked_at
     FROM procurement_handover_authorized_laborans
     WHERE lower(wallet_address) = lower($1)
     LIMIT 1`,
    [dbWallet]
  );
  if (walletCheck.rowCount === 0 || walletCheck.rows[0].is_active !== true) {
    console.log('[handover:walletCheck:failed]', {
      submissionId: String(submissionId),
      recovered: dbWallet,
      walletCheckRowCount: walletCheck.rowCount,
      walletCheckRow: walletCheck.rows[0] || null
    });
    const autoAuthorized = await upsertAuthorizedLaboran(dbWallet, req.user?.id || null);
    console.warn('[handover:walletCheck:autoAuthorized]', {
      submissionId: String(submissionId),
      wallet: dbWallet,
      row: autoAuthorized
    });
  }

  const typedTimestamp = Number(session.typed_timestamp || payload.message.timestamp || 0);
  const ageMs = Math.abs(Date.now() - (typedTimestamp * 1000));
  if (ageMs > 5 * 60 * 1000) {
    const err = new Error('Typed timestamp is outside the allowed window');
    err.code = 'TIMESTAMP_OUT_OF_RANGE';
    throw err;
  }

  const nonceCheck = await procurementDb.query(
    'SELECT id FROM procurement_handover_nonce_ledger WHERE nonce = $1 LIMIT 1',
    [session.nonce]
  );
  if (nonceCheck.rowCount > 0) {
    const err = new Error('Nonce has already been used');
    err.code = 'NONCE_USED';
    throw err;
  }

  const { contract, wallet } = await getRelayer();
  await ensureLaboranAuthorizedOnChain(contract, dbWallet);
  const tx = await contract.confirmHandoverWithSig(
    BigInt(submissionId),
    session.student_id_hash,
    session.items_hash,
    'COMPLETED',
    BigInt(payload.message.timestamp),
    BigInt(session.nonce),
    signature
  );
  const receipt = await tx.wait();

  await procurementDb.query(
    `INSERT INTO procurement_handover_nonce_ledger (submission_id, nonce, used_by_wallet)
     VALUES ($1::int, $2::bigint, $3::text)
     ON CONFLICT (nonce) DO NOTHING`,
    [submissionId, session.nonce.toString(), dbWallet]
  );

  const { rows: updated } = await procurementDb.query(
    `UPDATE procurement_handover_sessions
     SET laboran_wallet = $1::text,
         laboran_verified_at = now(),
         signature = $2::text,
         tx_hash = $3::text,
         tx_submitted_at = now(),
         status = $4::text,
         updated_at = now(),
         proof = jsonb_build_object(
           'txHash', $3::text,
           'laboranWallet', $1::text,
           'relayerWallet', $5::text,
           'receipt', $6::jsonb
         )
     WHERE submission_id = $7::int
     RETURNING *`,
    [dbWallet, signature, tx.hash, 'SUBMITTED_ON_CHAIN', wallet.address, JSON.stringify({
      transactionHash: receipt?.hash || tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      status: receipt?.status ?? null
    }), submissionId]
  );

  return { session: updated[0], txHash: tx.hash, laboranWallet: dbWallet, receipt };
}

export async function getProof(submissionId) {
  const row = await getSubmissionHandoverRow(submissionId);
  if (!row) return null;
  const { rows } = await procurementDb.query(
    `SELECT *
     FROM procurement_handover_sessions
     WHERE submission_id = $1
     LIMIT 1`,
    [submissionId]
  );
  const session = rows[0] || null;
  if (!session) return null;

  const proof = {
    submission_id: Number(session.submission_id),
    student_id_hash: session.student_id_hash,
    items_hash: session.items_hash,
    status: session.status,
    timestamp: session.typed_timestamp ? Number(session.typed_timestamp) : null,
    nonce: session.nonce ? String(session.nonce) : null,
    laboran_wallet: session.laboran_wallet || null,
    tx_hash: session.tx_hash || null,
    tx_submitted_at: session.tx_submitted_at || null,
    tx_confirmed_at: session.tx_confirmed_at || null,
    confirmation_code_verified_at: session.confirmation_code_verified_at || null,
    is_confirmed: session.status === 'COMPLETED',
    etherscan_url: session.tx_hash ? `https://sepolia.etherscan.io/tx/${session.tx_hash}` : null
  };
  return proof;
}

export async function listAuthorizedLaborans() {
  const { rows } = await procurementDb.query(
    `SELECT wallet_address, is_active, revoked_at, revoked_by, created_at, updated_at
     FROM procurement_handover_authorized_laborans
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function upsertAuthorizedLaboran(walletAddress, actorUserId = null) {
  const normalized = normalizeWallet(walletAddress);
  const { rows } = await procurementDb.query(
    `INSERT INTO procurement_handover_authorized_laborans (wallet_address, is_active, created_at, updated_at)
     VALUES ($1, TRUE, now(), now())
     ON CONFLICT (wallet_address)
     DO UPDATE SET is_active = TRUE, revoked_at = NULL, revoked_by = NULL, updated_at = now()
     RETURNING *`,
    [normalized]
  );
  return rows[0];
}

export async function revokeAuthorizedLaboran(walletAddress, actorUserId = null) {
  const normalized = normalizeWallet(walletAddress);
  const { rows } = await procurementDb.query(
    `UPDATE procurement_handover_authorized_laborans
     SET is_active = FALSE, revoked_at = now(), revoked_by = $2, updated_at = now()
     WHERE lower(wallet_address) = lower($1)
     RETURNING *`,
    [normalized, actorUserId]
  );
  return rows[0] || null;
}

export async function processChainEvent(event) {
  const submissionId = Number(event?.args?.submissionId ?? event?.args?.[0] ?? 0);
  const laboranWallet = normalizeWallet(event?.args?.laboranWallet ?? event?.args?.[2] ?? '');
  const nonce = event?.args?.nonce ?? event?.args?.[4] ?? null;
  const timestamp = event?.args?.timestamp ?? event?.args?.[3] ?? null;
  const txHash = event?.log?.transactionHash || event?.transactionHash || null;

  await procurementDb.query(
    `UPDATE procurement_submission
     SET status = 'completed',
         updated_at = now()
     WHERE id = $1::int`,
    [submissionId]
  );

  await procurementDb.query(
    `UPDATE procurement_handover_sessions
     SET status = 'COMPLETED',
         laboran_wallet = COALESCE(laboran_wallet, $1::text),
         tx_hash = COALESCE(tx_hash, $2::text),
         tx_confirmed_at = now(),
         updated_at = now()
     WHERE submission_id = $3::int`,
    [laboranWallet, txHash, submissionId]
  );

  return { submissionId, laboranWallet, nonce: nonce ? String(nonce) : null, timestamp: timestamp ? String(timestamp) : null, txHash };
}

export async function initializeHandoverListener() {
  if (!CONTRACT_ADDRESS || !RELAYER_PRIVATE_KEY || !RPC_URL) {
    return { started: false, reason: 'missing_env' };
  }
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    contract.on('HandoverConfirmed', async (submissionId, studentIdHash, laboranWallet, timestamp, nonce, event) => {
      try {
        await processChainEvent({ args: { submissionId, studentIdHash, laboranWallet, timestamp, nonce }, log: event });
      } catch (error) {
        console.error('Handover listener failed:', error?.message || error);
      }
    });
    return { started: true };
  } catch (error) {
    console.error('Failed to initialize handover listener:', error?.message || error);
    return { started: false, error: error?.message || String(error) };
  }
}

export function getDefaultLaboranWallet() {
  return DEFAULT_LABORAN_WALLET;
}

export default {
  confirmReceipt,
  verifyConfirmationCode,
  submitSignature,
  getProof,
  listAuthorizedLaborans,
  upsertAuthorizedLaboran,
  revokeAuthorizedLaboran,
  initializeHandoverListener,
  getDefaultLaboranWallet
};
