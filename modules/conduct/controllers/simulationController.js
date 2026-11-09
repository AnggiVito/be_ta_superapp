import * as simulationService from '../services/simulationService.js';
import { generateRollingQrToken, QR_EXPIRY_SECONDS } from '../services/rollingQrService.js';
import { logger } from '../../../core/utils/logger.js';


function formatDateOnly(value) {
  if (!value) return value;
  if (value instanceof Date) {
    // Some environments/pg parsers convert Postgres DATE into a JS Date that
    // effectively represents midnight in WIB (+07:00). When the Node process
    // runs in UTC, reading local parts will shift the day backwards.
    // To keep the intended calendar date, normalize by adding +07:00 then
    // read UTC parts.
    const wibMs = value.getTime() + (7 * 60 * 60 * 1000);
    const wib = new Date(wibMs);
    const y = wib.getUTCFullYear();
    const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wib.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (!raw) return raw;
  if (raw.includes('T')) {
    return raw.split('T')[0];
  }
  return raw;
}

function formatSimulation(simulation) {
  if (!simulation || typeof simulation !== 'object') return simulation;
  return {
    ...simulation,
    simulation_date: formatDateOnly(simulation.simulation_date),
  };
}

function formatSimulationList(simulations) {
  if (!Array.isArray(simulations)) return simulations;
  return simulations.map(formatSimulation);
}


export async function createSimulation(req, res, next) {
  try {
    const creatorUserId = req.user?.id;

    if (!creatorUserId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const simulation = await simulationService.createSimulation({
      creatorUserId,
      payload: req.body || {},
    });

    return res.status(201).json({
      success: true,
      message: 'Practicum simulation created successfully',
      data: formatSimulation(simulation),
    });
  } catch (error) {
    logger.error('Error in createSimulation controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('must be') ||
      error.message.includes('harus lebih besar') ||
      error.message.includes('not found')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function listSimulations(req, res, next) {
  try {
    const result = await simulationService.listSimulations({
      query: req.query || {},
    });

    return res.status(200).json({
      success: true,
      message: 'Practicum simulation list retrieved successfully',
      data: formatSimulationList(result.simulations),
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in listSimulations controller:', error);
    next(error);
  }
}

export async function getSimulationDetail(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;

    const simulation = await simulationService.getSimulationById(simulationId);
    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    const attachments = await simulationService.getSimulationResultAttachments(
      simulationId,
    );

    return res.status(200).json({
      success: true,
      message: 'Practicum simulation details retrieved successfully',
      data: { ...formatSimulation(simulation), result_attachments: attachments },
    });
  } catch (error) {
    logger.error('Error in getSimulationDetail controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: 'simulationId must be UUID valid',
      });
    }

    next(error);
  }
}

export async function updateSimulation(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;

    const simulation = await simulationService.updateSimulation({
      simulationId,
      payload: req.body || {},
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Practicum simulation updated successfully',
      data: formatSimulation(simulation),
    });
  } catch (error) {
    logger.error('Error in updateSimulation controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('must be') ||
      error.message.includes('harus lebih besar') ||
      error.message.includes('not found') ||
      error.message.includes('is invalid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('invalid input syntax for type uuid')) {
      return res.status(400).json({
        success: false,
        message: 'simulationId must be UUID valid',
      });
    }

    next(error);
  }
}

export async function deleteSimulation(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const simulation = await simulationService.deleteSimulation(simulationId);

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Practicum simulation deleted successfully',
      data: simulation,
    });
  } catch (error) {
    logger.error('Error in deleteSimulation controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: 'simulationId must be UUID valid',
      });
    }

    next(error);
  }
}

export async function generateSimulationAttendanceQR(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const generatedByUserId = req.user?.id;

    const qrSession = await simulationService.generateSimulationAttendanceQR({
      simulationId,
      generatedByUserId,
    });

    if (!qrSession) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Simulation attendance QR generated successfully',
      data: qrSession,
    });
  } catch (error) {
    logger.error('Error in generateSimulationAttendanceQR controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('Simulation session has not been opened') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function scanSimulationAttendance(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const qrToken = req.body?.qrToken;
    const scannedByUserId = req.user?.id;
    const scannedIp = req.headers['x-forwarded-for'] || req.ip;
    const scannedUserAgent = req.headers['user-agent'];

    const attendance = await simulationService.scanSimulationAttendance({
      simulationId,
      qrToken,
      scannedByUserId,
      scannedIp,
      scannedUserAgent,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'QR token is invalid or has expired',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Simulation attendance recorded successfully',
      data: attendance,
    });
  } catch (error) {
    logger.error('Error in scanSimulationAttendance controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('qrToken is required') ||
      error.message.includes('Practicum simulation session has not been opened') ||
      error.message.includes('Practicum simulation session has already been closed') ||
      error.message.includes('Attendance time limit') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message.includes('QR token is invalid') ||
      error.message.includes('has expired')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}


export async function openSimulationSession(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const userId = req.user?.id;

    const simulation = await simulationService.openSimulationSession({
      simulationId,
      openedByUserId: userId,
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Simulation session opened successfully',
      data: formatSimulation(simulation),
    });
  } catch (error) {
    logger.error('Error in openSimulationSession controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('Simulation is already closed') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function closeSimulationSession(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const userId = req.user?.id;

    const simulation = await simulationService.closeSimulationSession({
      simulationId,
      closedByUserId: userId,
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Simulation session closed successfully',
      data: formatSimulation(simulation),
    });
  } catch (error) {
    logger.error('Error in closeSimulationSession controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function submitSimulationResult(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const userId = req.user?.id;
    const note = req.body?.note;
    const files = req.files;

    const current = await simulationService.getSimulationById(simulationId);
    if (!current) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    const wasSubmitted = Boolean(current.result_submitted_at);

    const result = await simulationService.submitSimulationResult({
      simulationId,
      submittedByUserId: userId,
      note,
      files,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }

    return res.status(201).json({
      success: true,
      message: wasSubmitted
          ? 'Simulation result updated successfully'
          : 'Simulation result submitted successfully',
      data: {
        simulation: formatSimulation(result.simulation),
        attachments: result.attachments,
      },
    });
  } catch (error) {
    logger.error('Error in submitSimulationResult controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('Maximum upload is 3') ||
      error.message.includes('File type') ||
      error.message.includes('has not been closed') ||
      error.message.includes('At least 1') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function deleteSimulationResultAttachment(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const attachmentId = req.params?.attachmentId;
    const userId = req.user?.id;

    const deleted = await simulationService.deleteSimulationResultAttachment({
      simulationId,
      attachmentId,
      requestedByUserId: userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully',
      data: deleted,
    });
  } catch (error) {
    logger.error('Error in deleteSimulationResultAttachment controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('attachmentId is required') ||
      error.message.includes('At least 1') ||
      error.message.includes('has not been closed') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('terautentikasi')) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getSimulationAttendanceList(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;
    const limit = req.query?.limit;
    const offset = req.query?.offset;

    const result = await simulationService.getSimulationAttendanceList({
      simulationId,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      message: 'Simulation attendance list retrieved successfully',
      data: result.attendance,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in getSimulationAttendanceList controller:', error);

    if (
      error.message.includes('simulationId is required') ||
      error.message.includes('invalid input syntax for type uuid')
    ) {
      return res.status(400).json({
        success: false,
        message: 'simulationId must be UUID valid',
      });
    }

    next(error);
  }
}

/**
 * Ambil token QR yang sedang aktif (tanpa generate baru).
 * Berguna untuk menampilkan kembali QR yang sudah ada saat halaman di-refresh.
 *
 * GET /api/v1/conducts/simulations/:simulationId/attendance-qr/active
 */
export async function getActiveSimulationQrHandler(req, res, next) {
  try {
    const simulationId = req.params?.simulationId;

    const activeSession = await simulationService.getActiveSimulationQr(simulationId);

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active QR is available for this simulation. Please generate a new QR.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Active QR retrieved successfully',
      data: activeSession,
    });
  } catch (error) {
    logger.error('Error in getActiveSimulationQrHandler controller:', error);
    next(error);
  }
}

/**
 * Rolling QR via Server-Sent Events (SSE).
 *
 * Endpoint ini membuka koneksi "streaming" antara server dan browser.
 * Setiap 15 detik, server otomatis:
 *  1. Generate token baru
 *  2. Nonaktifkan token lama
 *  3. Kirim data QR baru ke browser lewat koneksi yang sama
 *
 * Frontend cukup mendengarkan event dari koneksi ini, tidak perlu polling manual.
 *
 * Cara pakai di frontend (JavaScript):
 *   const source = new EventSource('/api/v1/conducts/simulations/{id}/attendance-qr/stream', ...);
 *   source.addEventListener('qr_update', (e) => {
 *     const data = JSON.parse(e.data);
 *     document.getElementById('qr-img').src = data.qrCodeImage;
 *   });
 *
 * GET /api/v1/conducts/simulations/:simulationId/attendance-qr/stream
 */
export async function rollingQrStream(req, res, next) {
  const simulationId = req.params?.simulationId;
  const generatedByUserId = req.user?.id;

  if (!generatedByUserId) {
    return res.status(401).json({
      success: false,
      message: 'User is not authenticated',
    });
  }

  if (!simulationId) {
    return res.status(400).json({
      success: false,
      message: 'simulationId is required',
    });
  }

  // Guard: rolling QR stream can only ketika session sudah dibuka.
  try {
    const simulation = await simulationService.getSimulationById(simulationId);
    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: 'Practicum simulation not found',
      });
    }
    if (simulation.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: 'Simulation session has not been opened',
      });
    }
  } catch (error) {
    logger.error('Error checking simulation status in rollingQrStream:', error);
    return next(error);
  }

  // --- Setup header SSE ---
  // SSE menggunakan Content-Type: text/event-stream
  // Browser akan menjaga koneksi ini tetap terbuka
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Penting untuk Nginx
  res.flushHeaders();

  /**
   * Kirim event SSE ke client.
   * Format SSE standar:
   *   event: <nama_event>\n
   *   data: <json string>\n\n
   */
  function sendEvent(eventName, payload) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // Fungsi: generate token baru dan kirim ke client via SSE
  async function pushNewQr() {
    try {
      const qrData = await generateRollingQrToken({
        simulationId,
        generatedBy: generatedByUserId,
      });

      sendEvent('qr_update', {
        ...qrData,
        serverTime: new Date().toISOString(),
        nextRefreshIn: QR_EXPIRY_SECONDS,
      });
    } catch (error) {
      logger.error('Error generating QR in SSE stream', { simulationId, error: error.message });
      sendEvent('qr_error', {
        message: 'Failed to generate a new QR',
        error: error.message,
      });
    }
  }

  // Generate & kirim QR pertama segera saat koneksi dibuka
  await pushNewQr();

  // Set interval: generate & kirim QR baru setiap 15 detik
  const intervalId = setInterval(pushNewQr, QR_EXPIRY_SECONDS * 1000);

  // Kirim heartbeat setiap 10 detik agar koneksi tidak di-timeout oleh proxy/load balancer
  const heartbeatId = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 10000);

  // Bersihkan interval saat client disconnect (tutup browser / navigasi pergi)
  req.on('close', () => {
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    logger.info('SSE QR stream disconnected', { simulationId, userId: generatedByUserId });
  });
}

