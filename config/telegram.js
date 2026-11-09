import { loadEnvSafe } from '../core/utils/envLoader.js';

loadEnvSafe();

export const telegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  webhookSecretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '',
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
  roomBookingChatId: process.env.TELEGRAM_ROOM_BOOKING_CHAT_ID || '',
  notificationsEnabled: String(
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED || 'false'
  ).toLowerCase() === 'true',
};
