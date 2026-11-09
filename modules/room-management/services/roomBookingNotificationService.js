import {
  sendRoomBookingMessageSafely,
  sendTelegramMessageToChatSafely,
} from '../../../services/telegram/telegramService.js';
import { getLinkedChatForUser } from './telegramUserLinkService.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function requesterLabel(booking) {
  return booking?.requesterLabel || booking?.requester_label || booking?.created_by || '-';
}

function actorLabel({ actorLabel: label, actorId } = {}) {
  return label || actorId || '-';
}

function activationNote(booking) {
  if (!booking?.start_time || !booking?.end_time) return null;

  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const durationMs = end.getTime() - start.getTime();
  const thresholdMs = 25 * 60 * 60 * 1000;

  if (!Number.isFinite(durationMs) || durationMs < thresholdMs) {
    return null;
  }

  const deadline = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return `Note: The code must be used at least once before ${formatDateTime(deadline)}. If not, it will be invalidated.`;
}

function buildBookingMessage({ title, status, room, booking, actorId, actorLabel: label }) {
  const lines = [
    `<b>${escapeHtml(title)}</b>`,
    '',
    `Room: ${escapeHtml(room?.name || booking?.room_id || '-')}`,
    `Requester: ${escapeHtml(requesterLabel(booking))}`,
    `Start: ${escapeHtml(formatDateTime(booking?.start_time))}`,
    `End: ${escapeHtml(formatDateTime(booking?.end_time))}`,
    `Purpose: ${escapeHtml(booking?.description || '-')}`,
    `Status: ${escapeHtml(status)}`,
  ];

  if (booking?.rejection_note) {
    lines.push(`Reason: ${escapeHtml(booking.rejection_note)}`);
  }

  if (actorId || label) {
    lines.push(`By: ${escapeHtml(actorLabel({ actorLabel: label, actorId }))}`);
  }

  return lines.join('\n');
}

function buildPasscodeMessage({ room, booking, passcode, actorId, actorLabel: label }) {
  const lines = [
    '<b>Room Booking Approved</b>',
    '',
    `Room: ${escapeHtml(room?.name || booking?.room_id || passcode?.roomName || '-')}`,
    `Requester: ${escapeHtml(requesterLabel(booking))}`,
    `Start: ${escapeHtml(formatDateTime(booking?.start_time))}`,
    `End: ${escapeHtml(formatDateTime(booking?.end_time))}`,
    `Purpose: ${escapeHtml(booking?.description || '-')}`,
    `Approved by: ${escapeHtml(actorLabel({ actorLabel: label, actorId }))}`,
    '',
    `Passcode Name: ${escapeHtml(passcode?.name || '-')}`,
    `Passcode Type: ${escapeHtml(passcode?.type || '-')}`,
    `Passcode: <code>${escapeHtml(passcode?.passcode || '-')}</code>`,
  ];

  if (passcode?.startDate || passcode?.start_date) {
    lines.push(`Valid From: ${escapeHtml(formatDateTime(passcode.startDate || passcode.start_date))}`);
  }

  if (passcode?.endDate || passcode?.end_date) {
    lines.push(`Valid Until: ${escapeHtml(formatDateTime(passcode.endDate || passcode.end_date))}`);
  }

  const note = activationNote(booking);
  if (note) {
    lines.push('', escapeHtml(note));
  }

  return lines.join('\n');
}

function buildRequesterRejectedMessage({ room, booking, actorId, actorLabel: label }) {
  return buildBookingMessage({
    title: 'Your Room Booking Was Rejected',
    status: 'Rejected',
    room,
    booking,
    actorId,
    actorLabel: label,
  });
}

function buildRequesterPasscodeMessage({ room, booking, passcode, actorId, actorLabel: label }) {
  const lines = [
    '<b>Your Room Booking Was Approved</b>',
    '',
    `Room: ${escapeHtml(room?.name || booking?.room_id || passcode?.roomName || '-')}`,
    `Start: ${escapeHtml(formatDateTime(booking?.start_time))}`,
    `End: ${escapeHtml(formatDateTime(booking?.end_time))}`,
    `Purpose: ${escapeHtml(booking?.description || '-')}`,
    `Approved by: ${escapeHtml(actorLabel({ actorLabel: label, actorId }))}`,
    '',
    `Passcode Name: ${escapeHtml(passcode?.name || '-')}`,
    `Passcode Type: ${escapeHtml(passcode?.type || '-')}`,
    `Passcode: <code>${escapeHtml(passcode?.passcode || '-')}</code>`,
  ];

  if (passcode?.startDate || passcode?.start_date) {
    lines.push(`Valid From: ${escapeHtml(formatDateTime(passcode.startDate || passcode.start_date))}`);
  }

  if (passcode?.endDate || passcode?.end_date) {
    lines.push(`Valid Until: ${escapeHtml(formatDateTime(passcode.endDate || passcode.end_date))}`);
  }

  const note = activationNote(booking);
  if (note) {
    lines.push('', escapeHtml(note));
  }

  return lines.join('\n');
}

async function notifyBooking(event, message) {
  return sendRoomBookingMessageSafely(message, {
    event,
  });
}

export function notifyPendingBookingCreated({ room, booking }) {
  const message = buildBookingMessage({
    title: 'New Room Booking Request',
    status: 'Pending',
    room,
    booking,
  });

  return notifyBooking('room_booking_pending_created', message);
}

export function notifyBookingApproved({ room, booking, actorId, actorLabel: label }) {
  const message = buildBookingMessage({
    title: 'Room Booking Approved',
    status: 'Approved',
    room,
    booking,
    actorId,
    actorLabel: label,
  });

  return notifyBooking('room_booking_approved', message);
}

export function notifyBookingRejected({ room, booking, actorId, actorLabel: label }) {
  const message = buildBookingMessage({
    title: 'Room Booking Rejected',
    status: 'Rejected',
    room,
    booking,
    actorId,
    actorLabel: label,
  });

  return notifyBooking('room_booking_rejected', message);
}

export function notifyBookingPasscodeGenerated({ room, booking, passcode, actorId, actorLabel: label }) {
  const message = buildPasscodeMessage({
    room,
    booking,
    passcode,
    actorId,
    actorLabel: label,
  });

  return notifyBooking('room_booking_approved', message);
}

async function notifyRequester(userId, event, message) {
  try {
    if (!userId) return { skipped: true };
    const link = await getLinkedChatForUser(userId);
    if (!link?.telegram_chat_id) {
      return { skipped: true, reason: 'telegram_not_linked' };
    }

    return sendTelegramMessageToChatSafely(link.telegram_chat_id, message, {
      event,
      userId,
    });
  } catch (error) {
    return { failed: true, error: error.message };
  }
}

export function notifyRequesterBookingRejected({ room, booking, actorId, actorLabel: label }) {
  const message = buildRequesterRejectedMessage({
    room,
    booking,
    actorId,
    actorLabel: label,
  });

  return notifyRequester(booking?.created_by, 'room_booking_rejected_direct', message);
}

export function notifyRequesterBookingPasscodeGenerated({ room, booking, passcode, actorId, actorLabel: label }) {
  const message = buildRequesterPasscodeMessage({
    room,
    booking,
    passcode,
    actorId,
    actorLabel: label,
  });

  return notifyRequester(booking?.created_by, 'room_booking_passcode_direct', message);
}
