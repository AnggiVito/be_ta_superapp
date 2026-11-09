import axios from 'axios';
import { telegramConfig } from '../../config/telegram.js';
import { logger } from '../../core/utils/logger.js';

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

function isConfigured() {
  return Boolean(
    telegramConfig.notificationsEnabled &&
      telegramConfig.botToken &&
      telegramConfig.roomBookingChatId
  );
}

function canSendDirectMessage() {
  return Boolean(telegramConfig.notificationsEnabled && telegramConfig.botToken);
}

async function sendMessageToChat(chatId, text) {
  const url = `${TELEGRAM_API_BASE_URL}/bot${telegramConfig.botToken}/sendMessage`;

  const response = await axios.post(
    url,
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    { timeout: 10000 }
  );

  logger.info('Telegram message sent', {
    chatId,
    messageId: response.data?.result?.message_id,
  });

  return response.data;
}

export async function sendRoomBookingMessage(text) {
  if (!telegramConfig.notificationsEnabled) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!telegramConfig.botToken || !telegramConfig.roomBookingChatId) {
    logger.warn('Telegram notification skipped: missing bot token or chat ID');
    return { skipped: true, reason: 'missing_config' };
  }

  return sendMessageToChat(telegramConfig.roomBookingChatId, text);
}

export async function sendRoomBookingMessageSafely(text, context = {}) {
  if (!isConfigured()) {
    return { skipped: true };
  }

  try {
    return await sendRoomBookingMessage(text);
  } catch (error) {
    logger.error('Telegram room booking notification failed:', {
      ...context,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return { failed: true, error: error.message };
  }
}

export async function sendTelegramMessageToChatSafely(chatId, text, context = {}) {
  if (!canSendDirectMessage() || !chatId) {
    return { skipped: true };
  }

  try {
    return await sendMessageToChat(chatId, text);
  } catch (error) {
    logger.error('Telegram direct message failed:', {
      ...context,
      chatId,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return { failed: true, error: error.message };
  }
}

export async function registerTelegramWebhook(webhookUrl) {
  if (!telegramConfig.botToken) {
    throw new Error('Telegram bot token is not configured');
  }

  if (!webhookUrl) {
    throw new Error('Telegram webhook URL is required');
  }

  const url = `${TELEGRAM_API_BASE_URL}/bot${telegramConfig.botToken}/setWebhook`;
  const response = await axios.post(
    url,
    {
      url: webhookUrl,
      secret_token: telegramConfig.webhookSecretToken || undefined,
    },
    { timeout: 10000 }
  );

  logger.info('Telegram webhook registered', {
    webhookUrl,
    ok: response.data?.ok,
    description: response.data?.description,
  });

  return {
    webhookUrl,
    telegramResponse: response.data,
  };
}

export async function getTelegramWebhookInfo() {
  if (!telegramConfig.botToken) {
    throw new Error('Telegram bot token is not configured');
  }

  const url = `${TELEGRAM_API_BASE_URL}/bot${telegramConfig.botToken}/getWebhookInfo`;
  const response = await axios.get(url, { timeout: 10000 });
  return response.data;
}
