import * as enrollmentModel from '../models/enrollmentModel.js';
import * as practicumModel from '../models/practicumModel.js';
import * as roleService from '../../user-management/services/roleService.js';
import * as profileModel from '../../user-management/models/profileModel.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Enroll user to a practicum
 * studentId is the user id (we store it in student_id column)
 */
export async function enroll(practicumId, studentId) {
  try {
    // Check practicum exists
    const practicum = await practicumModel.findById(practicumId);
    if (!practicum) {
      throw new Error('Practicum tidak ditemukan');
    }

    // Check existing enrollment
    const existing = await enrollmentModel.findByStudentAndPracticum(studentId, practicumId);
    if (existing) {
      throw new Error('Anda sudah terdaftar pada practicum ini');
    }

    // Determine enrollment role from user's active assigned roles
    // Priority: asisten_praktikum_aktif -> asisten_praktikum -> asisten -> mahasiswa
    let enrollmentRole = 'mahasiswa';
    const activeRoles = await roleService.getActiveUserRoles(studentId);
    const roleNames = (activeRoles || []).map(r => r.role);
    if (roleNames.includes('asisten_praktikum_aktif')) {
      enrollmentRole = 'asisten_praktikum_aktif';
    } else if (roleNames.includes('asisten_praktikum')) {
      enrollmentRole = 'asisten_praktikum';
    } else if (roleNames.includes('asisten')) {
      enrollmentRole = 'asisten';
    }

    // Create enrollment with derived role
    const enrollment = await enrollmentModel.create({ practicum_id: practicumId, student_id: studentId, role: enrollmentRole });
    logger.info('User enrolled to practicum', { practicumId, studentId, enrollmentId: enrollment.id });
    return enrollment;
  } catch (error) {
    logger.error('Error enrolling user to practicum:', error);
    throw error;
  }
}

export async function getUserEnrollments(studentId) {
  try {
    return await enrollmentModel.findByStudent(studentId);
  } catch (error) {
    logger.error('Error getting user enrollments:', error);
    throw error;
  }
}

/**
 * List all enrollments for a practicum, enriched with student name & NIM from user_profiles.
 * @param {string} practicumId
 * @param {{ role?: string }} [options]
 */
export async function getPracticumEnrollments(practicumId, { role } = {}) {
  try {
    const practicum = await practicumModel.findById(practicumId);
    if (!practicum) {
      throw new Error('Practicum tidak ditemukan');
    }

    let enrollments = await enrollmentModel.findByPracticum(practicumId);
    if (role) {
      enrollments = enrollments.filter((e) => e.role === role);
    }

    const userIds = enrollments.map((e) => e.student_id).filter(Boolean);
    const profiles = await profileModel.findByUserIds(userIds);
    const profileByUserId = new Map(
      profiles.map((p) => [String(p.user_id).toLowerCase(), p])
    );

    return enrollments.map((enrollment) => {
      const profile = profileByUserId.get(String(enrollment.student_id).toLowerCase());
      return {
        ...enrollment,
        student_name: profile?.name || null,
        student_nim: profile?.nipnim || null,
      };
    });
  } catch (error) {
    logger.error('Error getting practicum enrollments:', error);
    throw error;
  }
}

export async function cancelEnrollment(enrollmentId, studentId) {
  try {
    const enrollment = await enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      throw new Error('Enrollment tidak ditemukan');
    }
    // Only owner can cancel
    if (String(enrollment.student_id) !== String(studentId)) {
      throw new Error('Anda tidak memiliki izin untuk membatalkan enrollment ini');
    }

    await enrollmentModel.remove(enrollmentId);
    logger.info('Enrollment cancelled', { enrollmentId, studentId });
    return true;
  } catch (error) {
    logger.error('Error cancelling enrollment:', error);
    throw error;
  }
}
