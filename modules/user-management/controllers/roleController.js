/**
 * Role Controller
 * Handle HTTP requests untuk role management
 */

import * as roleService from '../services/roleService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get user roles
 * GET /api/user-management/users/:userId/roles
 */
export async function getUserRoles(req, res) {
  try {
    const { userId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';

    const roles = includeInactive 
      ? await roleService.getUserRoles(userId)
      : await roleService.getActiveUserRoles(userId);

    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    logger.error('Error in getUserRoles controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting user roles',
    });
  }
}

/**
 * Assign role to user
 * POST /api/user-management/users/:userId/roles
 */
export async function assignRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const assignedBy = req.user?.id ? String(req.user.id) : null;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role harus diisi',
      });
    }

    const assignedRole = await roleService.assignRole(userId, role, assignedBy);

    res.json({
      success: true,
      data: assignedRole,
      message: 'Role berhasil diassign',
    });
  } catch (error) {
    logger.error('Error in assignRole controller:', error);
    const statusCode = error.message.includes('tidak valid') || error.message.includes('harus memiliki') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error assigning role',
    });
  }
}

/**
 * Update role status
 * PUT /api/user-management/roles/:roleId
 */
export async function updateRoleStatus(req, res) {
  try {
    const { roleId } = req.params;
    const { isActive } = req.body;
    const updatedBy = req.user?.id ? String(req.user.id) : null;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive harus berupa boolean',
      });
    }

    const role = await roleService.updateRoleStatus(roleId, isActive, updatedBy);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role tidak ditemukan',
      });
    }

    res.json({
      success: true,
      data: role,
      message: 'Status role berhasil diupdate',
    });
  } catch (error) {
    logger.error('Error in updateRoleStatus controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating role status',
    });
  }
}

/**
 * Remove role from user
 * DELETE /api/user-management/roles/:roleId
 */
export async function removeRole(req, res) {
  try {
    const { roleId } = req.params;
    const removedBy = req.user?.id ? String(req.user.id) : null;

    const role = await roleService.removeRole(roleId, removedBy);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role tidak ditemukan',
      });
    }

    res.json({
      success: true,
      data: role,
      message: 'Role berhasil dihapus',
    });
  } catch (error) {
    logger.error('Error in removeRole controller:', error);
    // Return 400 for validation errors (minimal user requirement)
    const statusCode = error.message.includes('harus ada minimal') || error.message.includes('tidak ditemukan') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error removing role',
    });
  }
}

/**
 * Get all users with specific role
 * GET /api/user-management/roles/:role/users
 */
export async function getUsersByRole(req, res) {
  try {
    const { role } = req.params;
    const includeInactive = req.query.includeInactive === 'true';

    const users = await roleService.getUsersByRole(role, includeInactive);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Error in getUsersByRole controller:', error);
    const statusCode = error.message.includes('tidak valid') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting users by role',
    });
  }
}

/**
 * Get all users
 * GET /api/user-management/users?role=asisten_praktikum&role=koordinator_praktikum
 * Returns all users with user_id, name, and identifier
 * Only accessible by kaur_lab and laboran (admin-like access)
 * Query params:
 *   - role: Filter by role(s). Can be multiple values. User must have at least one of the specified roles.
 */
export async function getAllUsers(req, res) {
  try {
    // Get role filter from query params (can be multiple values)
    let roles = null;
    if (req.query.role) {
      // Handle both single value and array
      if (Array.isArray(req.query.role)) {
        roles = req.query.role;
      } else {
        roles = [req.query.role];
      }
    }

    const users = await roleService.getAllUsers(roles);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Error in getAllUsers controller:', error);
    const statusCode = error.message.includes('tidak valid') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting all users',
    });
  }
}

