import Joi from 'joi';
import * as handoverSvc from '../services/handoverService.js';

function isTpa(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'tpa') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => String(r?.role || r?.name || r || '').toLowerCase() === 'tpa');
  }
  return false;
}

const confirmReceiptSchema = Joi.object({
  submission_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional()
});

const confirmCodeSchema = Joi.object({
  submission_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  code: Joi.string().length(4).required()
});

const signatureSchema = Joi.object({
  submission_id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  signature: Joi.string().min(20).required(),
  laboran_wallet: Joi.string().optional()
});

export async function confirmReceipt(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { error } = confirmReceiptSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.message });

    const submissionId = req.params.id || req.body.submission_id;
    const result = await handoverSvc.confirmReceipt(req, submissionId);
    return res.status(200).json({
      success: true,
      message: 'Receipt confirmed',
      data: {
        submission_id: Number(submissionId),
        code: result.code,
        items_hash: result.itemsHash,
        student_id_hash: result.studentIdHash,
        expires_at: result.session?.confirmation_code_expires_at || null,
        status: result.session?.status || 'WAITING_VERIFICATION'
      }
    });
  } catch (error) {
    if (error?.code === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Forbidden' });
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Submission not found' });
    next(error);
  }
}

export async function verifyCode(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { error, value } = confirmCodeSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.message });

    const submissionId = req.params.id || value.submission_id;
    const result = await handoverSvc.verifyConfirmationCode(req, submissionId, value.code);
    return res.status(200).json({
      success: true,
      message: 'Code verified',
      data: {
        submission_id: Number(submissionId),
        eip712_payload: result.payload,
        status: result.session?.status || 'CODE_VERIFIED'
      }
    });
  } catch (error) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Handover session not found' });
    if (error?.code === 'EXPIRED_CODE') return res.status(409).json({ success: false, message: 'Confirmation code expired' });
    if (error?.code === 'INVALID_CODE') return res.status(400).json({ success: false, message: 'Invalid confirmation code' });
    if (error?.code === 'INVALID_STATE') return res.status(409).json({ success: false, message: error.message });
    next(error);
  }
}

export async function submitSignature(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { error, value } = signatureSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.message });

    const submissionId = req.params.id || value.submission_id;
    const result = await handoverSvc.submitSignature(req, submissionId, value.signature, value.laboran_wallet);
    return res.status(200).json({
      success: true,
      message: 'Signature submitted',
      data: {
        submission_id: Number(submissionId),
        tx_hash: result.txHash,
        laboran_wallet: result.laboranWallet,
        etherscan_url: `https://sepolia.etherscan.io/tx/${result.txHash}`,
        status: result.session?.status || 'SUBMITTED_ON_CHAIN'
      }
    });
  } catch (error) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Handover session not found' });
    if (error?.code === 'INVALID_STATE') return res.status(409).json({ success: false, message: error.message });
    if (error?.code === 'INVALID_SIGNATURE') return res.status(400).json({ success: false, message: error.message });
    if (error?.code === 'WALLET_NOT_AUTHORIZED') return res.status(403).json({ success: false, message: error.message });
    if (error?.code === 'TIMESTAMP_OUT_OF_RANGE') return res.status(409).json({ success: false, message: error.message });
    if (error?.code === 'NONCE_USED') return res.status(409).json({ success: false, message: error.message });
    if (error?.code === 'RELAYER_NOT_CONFIGURED') return res.status(500).json({ success: false, message: error.message });
    next(error);
  }
}

export async function getProof(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const submissionId = req.params.id;
    const proof = await handoverSvc.getProof(submissionId);
    if (!proof) return res.status(404).json({ success: false, message: 'Proof not found' });
    return res.status(200).json({
      success: true,
      data: {
        ...proof,
        etherscan_url: proof.etherscan_url
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listAuthorizedLaborans(req, res, next) {
  try {
    const rows = await handoverSvc.listAuthorizedLaborans();
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

export async function authorizeLaboran(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isTpa(req.user)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const schema = Joi.object({ wallet_address: Joi.string().required() });
    const { error, value } = schema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.message });
    const row = await handoverSvc.upsertAuthorizedLaboran(value.wallet_address, req.user.id);
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
}

export async function revokeLaboran(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isTpa(req.user)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const row = await handoverSvc.revokeAuthorizedLaboran(req.params.wallet, req.user.id);
    if (!row) return res.status(404).json({ success: false, message: 'Laboran wallet not found' });
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
}

export default {
  confirmReceipt,
  verifyCode,
  submitSignature,
  getProof,
  listAuthorizedLaborans,
  authorizeLaboran,
  revokeLaboran
};
