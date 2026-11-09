import * as permitService from '../services/permitService.js';
import { logger } from '../../../core/utils/logger.js';

export async function submitPermit(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const permit = await permitService.submitPermitRequest({
      userId,
      payload: req.body || {},
    });

    return res.status(201).json({
      success: true,
      message: 'Permit request sent successfully',
      data: permit,
    });
  } catch (error) {
    logger.error('Error in submitPermit controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('must be') ||
      error.message.includes('can only') ||
      error.message.includes('sudah memiliki pengajuan')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getMyPermits(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const permits = await permitService.getMyPermits(userId);

    return res.status(200).json({
      success: true,
      message: 'Permit request data retrieved successfully',
      data: permits,
    });
  } catch (error) {
    logger.error('Error in getMyPermits controller:', error);
    next(error);
  }
}

export async function submitAssistantPermit(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const permit = await permitService.submitAssistantPermitRequest({
      userId,
      payload: req.body || {},
    });

    return res.status(201).json({
      success: true,
      message: 'Assistant leave/sick request sent successfully',
      data: permit,
    });
  } catch (error) {
    logger.error('Error in submitAssistantPermit controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('must be') ||
      error.message.includes('can only') ||
      error.message.includes('sudah memiliki pengajuan') ||
      error.message.includes('maksimal H-1')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getPicPermitsForReview(req, res, next) {
  try {
    const userId = req.user?.id;
    const { status } = req.query || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const permits = await permitService.getPicPermitSubmissions({ status });

    return res.status(200).json({
      success: true,
      message: 'Student permit request data retrieved successfully',
      data: permits,
    });
  } catch (error) {
    logger.error('Error in getAssistantPermitsForCoordinator controller:', error);

    if (error.message.includes('status filter is invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getAssistantPermitsForCoordinator(req, res, next) {
  try {
    const permits = await permitService.getAssistantPermitSubmissions({
      status: req.query?.status,
    });

    return res.status(200).json({
      success: true,
      message: 'Assistant request data retrieved successfully',
      data: permits,
    });
  } catch (error) {
    logger.error('Error in getAssistantPermitsForCoordinator controller:', error);

    if (error.message.includes('status filter is invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getPraktikanPermitsForPic(req, res, next) {
  try {
    const permits = await permitService.getPraktikanPermitSubmissions({
      status: req.query?.status,
    });

    return res.status(200).json({
      success: true,
      message: 'Student request data retrieved successfully',
      data: permits,
    });
  } catch (error) {
    logger.error('Error in getPraktikanPermitsForPic controller:', error);

    if (error.message.includes('status filter is invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function reviewAssistantPermit(req, res, next) {
  try {
    const reviewerId = req.user?.id;
    const permitId = req.params?.permitId;

    if (!reviewerId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const reviewedPermit = await permitService.reviewAssistantPermitRequest({
      permitId,
      reviewerId,
      payload: req.body || {},
    });

    return res.status(200).json({
      success: true,
      message: 'Assistant request reviewed successfully',
      data: reviewedPermit,
    });
  } catch (error) {
    logger.error('Error in reviewAssistantPermit controller:', error);

    if (error.message.includes('status filter')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function reviewPermit(req, res, next) {
  try {
    const reviewerId = req.user?.id;
    const permitId = req.params?.permitId;

    if (!reviewerId) {
      return res.status(401).json({
        success: false,
        message: 'User is not authenticated',
      });
    }

    const reviewedPermit = await permitService.reviewPermitRequest({
      permitId,
      reviewerId,
      payload: req.body || {},
    });

    return res.status(200).json({
      success: true,
      message: 'Permit request reviewed successfully',
      data: reviewedPermit,
    });
  } catch (error) {
    logger.error('Error in reviewPermit controller:', error);

    if (
      error.message.includes('is required') ||
      error.message.includes('is invalid') ||
      error.message.includes('not found') ||
      error.message.includes('hanya untuk') ||
      error.message.includes('sudah diproses')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function getPermitStatisticsForLaboran(req, res, next) {
  try {
    const statistics = await permitService.getPermitStatisticsForLaboran();

    return res.status(200).json({
      success: true,
      message: 'Permit request statistics retrieved successfully',
      data: statistics,
    });
  } catch (error) {
    logger.error('Error in getPermitStatisticsForLaboran controller:', error);
    next(error);
  }
}

