import { loadEnvSafe } from '../core/utils/envLoader.js';

// Load environment variables (tidak override yang sudah di-set dari Docker)
loadEnvSafe();

/**
 * JWT Configuration
 * Menggunakan JWT_SECRET dari environment variable
 * Fallback mechanism untuk development
 */
export const jwtConfig = {
  secret: process.env.JWT_SECRET || '',
  algorithm: 'HS256', // Default algorithm, bisa diubah jika AUTH GATEWAY pakai RS256
};

/**
 * Get JWT Secret
 * Prioritas: .env > default
 */
export function getJWTSecret() {
  const secret = jwtConfig.secret;
  
  if (!secret || secret === 'your_jwt_secret_key') {
    throw new Error(
      'JWT_SECRET not configured. Please set JWT_SECRET in .env file. ' +
      'Coordinate with AUTH GATEWAY team to get the same secret.'
    );
  }
  
  return secret;
}

/**
 * Validate JWT Secret is configured
 */
export function isJWTSecretConfigured() {
  return jwtConfig.secret && jwtConfig.secret !== 'your_jwt_secret_key';
}

