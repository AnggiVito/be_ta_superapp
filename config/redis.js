import redis from 'redis';
import { loadEnvSafe } from '../core/utils/envLoader.js';

// Load environment variables (tidak override yang sudah di-set dari Docker)
loadEnvSafe();

let redisClient = null;

export async function createRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✓ Redis connected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Redis connection error:', error);
    return null;
  }
}

export function getRedisClient() {
  return redisClient;
}

export async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}

