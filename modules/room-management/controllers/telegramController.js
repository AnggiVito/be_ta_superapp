import { telegramConfig } from '../../../config/telegram.js';
import * as telegramLinkService from '../services/telegramUserLinkService.js';
import {
  getTelegramWebhookInfo,
  registerTelegramWebhook,
} from '../../../services/telegram/telegramService.js';
import { logger } from '../../../core/utils/logger.js';

export async function createLinkCode(req, res) {
  try {
    const userId = req.user?.id;
    const data = await telegramLinkService.createLinkCode(userId);
    res.json({
      success: true,
      message: 'Telegram link code created',
      data,
    });
  } catch (error) {
    logger.error('Error creating Telegram link code:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error creating Telegram link code',
    });
  }
}

export async function getStatus(req, res) {
  try {
    const userId = req.user?.id;
    const data = await telegramLinkService.getStatus(userId);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting Telegram status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting Telegram status',
    });
  }
}

export async function unlink(req, res) {
  try {
    const userId = req.user?.id;
    const data = await telegramLinkService.unlink(userId);
    res.json({
      success: true,
      message: 'Telegram account unlinked',
      data,
    });
  } catch (error) {
    logger.error('Error unlinking Telegram:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error unlinking Telegram',
    });
  }
}

export async function webhook(req, res) {
  try {
    const expectedSecret = telegramConfig.webhookSecretToken;
    const receivedSecret = req.get('x-telegram-bot-api-secret-token');
    if (expectedSecret && receivedSecret !== expectedSecret) {
      logger.warn('Telegram webhook rejected: invalid secret token', {
        hasExpectedSecret: Boolean(expectedSecret),
        hasReceivedSecret: Boolean(receivedSecret),
      });
      return res.status(401).json({ success: false, message: 'Invalid secret token' });
    }

    logger.info('Telegram webhook received', {
      updateId: req.body?.update_id,
      text: req.body?.message?.text,
      chatId: req.body?.message?.chat?.id,
      username: req.body?.message?.from?.username,
    });

    const result = await telegramLinkService.handleWebhookUpdate(req.body);
    logger.info('Telegram webhook handled', result);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error handling Telegram webhook:', error);
    res.json({ success: true, data: { failed: true } });
  }
}

export async function registerWebhook(req, res) {
  try {
    const configuredUrl = String(req.body?.webhookUrl || telegramConfig.webhookUrl || '').trim();
    const fallbackUrl = `${req.protocol}://${req.get('host')}/api/room-management/telegram/webhook`;
    const webhookUrl = configuredUrl || fallbackUrl;
    const result = await registerTelegramWebhook(webhookUrl);
    const info = await getTelegramWebhookInfo();

    res.json({
      success: true,
      message: 'Telegram webhook registered',
      data: {
        webhookUrl,
        telegramResponse: result.telegramResponse,
        webhookInfo: info.result || info,
      },
    });
  } catch (error) {
    logger.error('Error registering Telegram webhook:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    res.status(400).json({
      success: false,
      message:
        error.response?.data?.description ||
        error.message ||
        'Error registering Telegram webhook',
    });
  }
}
