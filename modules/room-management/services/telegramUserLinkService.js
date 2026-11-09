import crypto from 'crypto';
import { telegramConfig } from '../../../config/telegram.js';
import * as telegramLinkModel from '../models/telegramUserLinkModel.js';
import { sendTelegramMessageToChatSafely } from '../../../services/telegram/telegramService.js';
import { logger } from '../../../core/utils/logger.js';

function publicStatus(row) {
  const linked = Boolean(row?.telegram_chat_id && row?.linked_at);
  return {
    linked,
    botUsername: telegramConfig.botUsername || null,
    telegramUsername: linked ? row.telegram_username : null,
    telegramFirstName: linked ? row.telegram_first_name : null,
    telegramLastName: linked ? row.telegram_last_name : null,
    linkedAt: linked ? row.linked_at : null,
  };
}

function generateCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

export async function createLinkCode(userId) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const row = await telegramLinkModel.upsertLinkCode(userId, code, expiresAt);
  const botUsername = telegramConfig.botUsername || null;
  return {
    ...publicStatus(row),
    code,
    expiresAt,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
  };
}

export async function getStatus(userId) {
  const row = await telegramLinkModel.getByUserId(userId);
  return publicStatus(row);
}

export async function unlink(userId) {
  const row = await telegramLinkModel.unlinkByUserId(userId);
  return publicStatus(row);
}

export async function getLinkedChatForUser(userId) {
  return telegramLinkModel.getLinkedByUserId(userId);
}

export async function handleWebhookUpdate(update) {
  const message = update?.message;
  const text = message?.text || '';
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !text.startsWith('/start')) {
    return { ignored: true };
  }

  const [, rawCode] = text.trim().split(/\s+/);
  const code = rawCode?.trim()?.toUpperCase();
  if (!code) {
    const linked = await telegramLinkModel.linkLatestPendingCode(from, chatId);
    if (linked) {
      await sendTelegramMessageToChatSafely(
        chatId,
        'Telegram connected successfully. You will receive room booking updates here.',
        { event: 'telegram_link_success_without_code', userId: linked.user_id }
      );

      logger.info('Telegram account linked from latest pending code', {
        userId: linked.user_id,
        chatId,
        telegramUserId: from?.id,
      });

      return { linked: true, userId: linked.user_id, fallback: true };
    }

    await sendTelegramMessageToChatSafely(
      chatId,
      'Please open Telegram from the Booking History page to connect your account, or send /start followed by your link code.',
      { event: 'telegram_link_missing_code' }
    );
    return { linked: false, reason: 'missing_code' };
  }

  const linked = await telegramLinkModel.linkByCode(code, from, chatId);
  if (!linked) {
    await sendTelegramMessageToChatSafely(
      chatId,
      'Telegram link code is invalid or expired. Please generate a new code from Booking History.',
      { event: 'telegram_link_invalid_code' }
    );
    return { linked: false, reason: 'invalid_or_expired' };
  }

  await sendTelegramMessageToChatSafely(
    chatId,
    'Telegram connected successfully. You will receive room booking updates here.',
    { event: 'telegram_link_success', userId: linked.user_id }
  );

  logger.info('Telegram account linked', {
    userId: linked.user_id,
    chatId,
    telegramUserId: from?.id,
  });

  return { linked: true, userId: linked.user_id };
}
