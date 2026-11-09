// Load environment variables FIRST - sebelum import module lain yang mungkin menggunakan env vars
import { loadEnvSafe } from './core/utils/envLoader.js';
loadEnvSafe();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import axios from 'axios';
import { logger } from './core/utils/logger.js';
import { testConnections, closeConnections } from './config/databases.js';
import { createRedisClient, closeRedisClient } from './config/redis.js';
import { errorHandler, notFoundHandler } from './core/middleware/errorHandler.js';
import { isJWTSecretConfigured } from './config/jwt.js';
import { 
  runUserManagementMigrations, 
  checkTablesExist,
  runReportingMigrations,
  checkReportingTablesExist,
  runActivityLogMigrations,
  checkActivityLogTablesExist,
  runRegistrationMigrations,
  checkRegistrationTablesExist,
  runConductMigrations,
  checkConductTablesExist,
  runProcurementMigrations,
  checkProcurementTablesExist,
  runRoomManagementMigrations,
  checkRoomManagementTablesExist
} from './core/utils/migrationRunner.js';
import { runUnifiedMigrations, getMigrationStatus } from './core/migrations/unifiedRunner.js';
import { getModuleConfig, getAllModuleNames } from './core/migrations/config.js';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { version: appVersion } = require('./package.json');
import { initializeUploadDir } from './modules/user-management/services/fileStorageService.js';

// Import module routes
import registrationRoutes from './modules/registration/routes.js';
import conductRoutes from './modules/conduct/routes.js';
import userManagementRoutes from './modules/user-management/routes.js';
import reportingRoutes from './modules/reporting/routes.js';
import procurementRouter from './modules/procurement/index.js';
import activityLogRoutes from './modules/activity-log/routes.js';
import roomManagementRoutes from './modules/room-management/routes.js';

// Import activity log middleware
import { activityLogMiddleware } from './modules/activity-log/middleware/activityLogMiddleware.js';

// Import JWT validator
import { validateJWT } from './core/auth/jwt-validator.js';
import { registerAuthGatewayProxy } from './core/auth/auth-gateway-proxy.js';

// Import static file handler dengan authentication
import { serveProtectedFile } from './core/middleware/staticFileAuth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy untuk aplikasi di belakang reverse proxy (nginx)
// Ini diperlukan untuk rate limiting dan IP detection yang akurat
app.set('trust proxy', true);

// Health check endpoint - HARUS SEBELUM CORS dan middleware lain
// Health check adalah internal endpoint untuk monitoring, tidak perlu CORS protection
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'FRI Super App Backend is running',
    version: appVersion,
    timestamp: new Date().toISOString(),
  });
});

// Security middleware
// Configure CORS dengan whitelist origin
const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header: Postman, curl, native mobile apps, monitoring probes.
    // CORS is enforced by browsers only when Origin is present — allow these through.
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [];
    
    // In production, reject if no CORS_ORIGIN configured
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
      logger.warn('CORS_ORIGIN not configured in production! This is a security risk.');
      return callback(new Error('CORS origin not configured'));
    }
    
    const isLocalhostOrigin =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
    const isPrivateLanOrigin =
      /^https?:\/\/((10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3}))(:\d+)?$/i.test(
        origin || '',
      );
    const isVirtualfriOrigin =
      /^https?:\/\/([a-z0-9-]+\.)*virtualfri\.id(?::\d+)?$/i.test(origin || '');

    // Allow if origin is in whitelist or matches common local/dev hosts
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      isLocalhostOrigin ||
      isPrivateLanOrigin ||
      isVirtualfriOrigin
    ) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Proxy endpoint for Telkom University gateway (periodes dropdown)
// In production, Nginx handles this. In local dev, this backend proxies it to avoid CORS.
app.get('/0ddcb99a088e1a0009d068fe29beba46', async (req, res) => {
  try {
    const response = await axios.get('https://gateway.telkomuniversity.ac.id/0ddcb99a088e1a0009d068fe29beba46', {
      timeout: 15000,
      headers: { 'Accept': 'application/json' },
    });
    res.json(response.data);
  } catch (err) {
    logger.error('Telkom gateway proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch period data from gateway' });
  }
});

// Configure Helmet dengan CSP yang lebih spesifik untuk Swagger
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for Swagger
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable untuk Swagger UI compatibility
};

// Disable CSP di development untuk kemudahan testing, tapi enable di production
if (process.env.NODE_ENV === 'production') {
  app.use(helmet(helmetConfig));
} else {
  app.use(helmet({
    ...helmetConfig,
    contentSecurityPolicy: false, // Disable di development untuk Swagger UI
  }));
}

// Body parser dengan size limits untuk mencegah DoS
app.use(express.json({ limit: '10mb' })); // Max 10MB JSON payload
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Max 10MB URL-encoded

// Local dev: proxy /login, /logout, /me → auth gateway (same-origin for Flutter web)
registerAuthGatewayProxy(app);

// Activity log middleware - capture semua aktivitas (harus setelah body parser)
app.use(activityLogMiddleware);

// Serve static files for uploads dengan authentication
// File uploads (TTD, receipts, feedback) harus diakses dengan JWT token
app.get('/uploads/*', validateJWT, serveProtectedFile);

// ==================== Tiered Rate Limiting ====================
// Different rate limits for different types of operations
// Selalu balas JSON agar klien (Flutter) tidak gagal jsonDecode pada teks polos.

const DEFAULT_OFFICIAL_FE_ORIGINS = [
  'https://dev-praktikum.virtualfri.id',
  'https://praktikum.virtualfri.id',
];

function parseOfficialFeOriginsForRateLimit() {
  const csv = process.env.RATE_LIMIT_SKIP_ORIGINS || '';
  if (csv.trim()) {
    return csv.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_OFFICIAL_FE_ORIGINS;
}

const officialFeOriginsForRateLimit = new Set(parseOfficialFeOriginsForRateLimit());

function normalizeRequestOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Origin/Referer dari browser FE resmi (bukan bukti kuat — header bisa dipalsu di luar browser). */
function requestOriginFromHeaders(req) {
  const origin = normalizeRequestOrigin(req.get('Origin'));
  if (origin) return origin;
  return normalizeRequestOrigin(req.get('Referer'));
}

function shouldSkipRateLimitForOfficialFe(req) {
  if (String(process.env.RATE_LIMIT_SKIP_OFFICIAL_FE || 'true').toLowerCase() === 'false') {
    return false;
  }
  const requestOrigin = requestOriginFromHeaders(req);
  if (!requestOrigin) return false;
  return officialFeOriginsForRateLimit.has(requestOrigin);
}

function rateLimitJsonHandler(req, res, _next, options) {
  const msg =
    typeof options?.message === 'string' && options.message.length > 0
      ? options.message
      : 'Too many requests from this IP, please try again later.';
  res.status(options.statusCode ?? 429).json({
    success: false,
    message: msg,
  });
}

// Very Strict: File uploads (prevent abuse & resource exhaustion)
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 upload requests per 15 minutes
  message: 'Too many upload requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  skip: shouldSkipRateLimitForOfficialFe,
  handler: rateLimitJsonHandler,
});

// Moderate: Write operations (POST, PUT, DELETE - except uploads)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 write requests per 15 minutes
  message: 'Too many write requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  skip: shouldSkipRateLimitForOfficialFe,
  handler: rateLimitJsonHandler,
});

// Lenient: Read operations (GET requests)
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 read requests per 15 minutes
  message: 'Too many read requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  skip: shouldSkipRateLimitForOfficialFe,
  handler: rateLimitJsonHandler,
});

// General: Default for all API routes (fallback)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 250, // limit each IP to 250 requests per 15 minutes (increased from 100)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  skip: shouldSkipRateLimitForOfficialFe,
  handler: rateLimitJsonHandler,
});

// Smart rate limiting middleware
// Apply different limiters based on HTTP method and path
const smartRateLimiter = (req, res, next) => {
  const path = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  // Check if it's an upload endpoint (file upload operations)
  // Pattern: /upload, /ttd (POST), /receipts (POST), /profile/ttd (POST)
  const isUploadEndpoint = 
    path.includes('/upload') || 
    (path.includes('/ttd') && method === 'POST') ||
    (path.includes('/receipts') && method === 'POST') ||
    (path.includes('/profile/ttd') && method === 'POST');

  // Check if it's a rolling QR generation endpoint (polls every 15s)
  const isRollingQrEndpoint = path.includes('/attendance-qr/generate') || path.includes('/attendance-qr/active');

  // Apply upload limiter for upload endpoints
  if (isUploadEndpoint) {
    return uploadLimiter(req, res, next);
  }

  // Apply lenient limiter for rolling QR to avoid 429 during normal polling
  if (isRollingQrEndpoint) {
    return readLimiter(req, res, next); // Use read limiter (500/15min) which is more lenient
  }

  // Apply read limiter for GET requests
  if (method === 'GET') {
    return readLimiter(req, res, next);
  }

  // Apply write limiter for POST, PUT, DELETE, PATCH
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return writeLimiter(req, res, next);
  }

  // Fallback to general limiter
  return generalLimiter(req, res, next);
};

// Apply smart rate limiting to all API routes
app.use('/api/', smartRateLimiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Normalize JSON responses middleware
// Ensures responses include a `message` field even when controllers use `error`.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        // If backend code returned { error: '...' } but no message, copy it to message
        if (!('message' in body) && ('error' in body)) {
          body.message = body.error;
        }
        // Ensure success boolean is present when not explicitly set
        if (!('success' in body)) {
          body.success = !!(body && (body.data !== undefined || body.message));
        }
      }
    } catch (e) {
      // ignore normalization errors and return original body
    }
    return originalJson(body);
  };
  next();
});

// Swagger UI — hanya NODE_ENV=development (tidak dipasang di production)
if (process.env.NODE_ENV === 'development') {
  const { swaggerSpec, swaggerUi } = await import('./config/swagger.js');
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', (req, res, next) => {
    // Dynamically set the first server URL to match the incoming request's origin
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const spec = JSON.parse(JSON.stringify(swaggerSpec));
    if (spec.servers && spec.servers.length > 0) {
      spec.servers[0].url = `${protocol}://${host}`;
      spec.servers[0].description = 'Current server (auto-detected)';
      // Remove the variables since we're setting the URL directly
      delete spec.servers[0].variables;
    }
    swaggerUi.setup(spec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'FRI Super App API Documentation',
      explorer: true,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    })(req, res, next);
  });
  app.get('/api-docs.json', (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const spec = JSON.parse(JSON.stringify(swaggerSpec));
    if (spec.servers && spec.servers.length > 0) {
      spec.servers[0].url = `${protocol}://${host}`;
      delete spec.servers[0].variables;
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  });
  logger.info('Swagger UI available at /api-docs');
  logger.info('Swagger JSON available at /api-docs.json');
  logger.info(`Swagger spec paths: ${Object.keys(swaggerSpec.paths || {}).length}`);
} else {
  logger.info('Swagger UI disabled (set NODE_ENV=development to enable)');
}

// Module routes
app.use('/api/registration', registrationRoutes);
app.use('/api/conduct', conductRoutes);
app.use('/api/user-management', userManagementRoutes);
app.use('/api/reporting', reportingRoutes);
app.use('/api/procurement', procurementRouter);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/room-management', roomManagementRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  try {
    try {
      const pdfMod = await import('./modules/procurement/services/pdfService.js');
      await pdfMod.closePdfBrowser?.();
    } catch (_) {
      /* ignore */
    }
    await closeConnections();
    await closeRedisClient();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize connections and start server
async function startServer() {
  try {
    // Validate JWT_SECRET configuration
    if (!isJWTSecretConfigured()) {
      logger.error('JWT_SECRET is not configured. Please set JWT_SECRET in .env file.');
      logger.error('Coordinate with AUTH GATEWAY team to get the same secret.');
      process.exit(1);
    }
    logger.info('✓ JWT_SECRET is configured');

    // Test database connections. If they fail, continue in degraded mode
    // so the process stays up (useful for accessing Swagger while debugging
    // DB connectivity). In production, you might want to fail-fast instead.
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.warn('Failed to connect to databases. Continuing in degraded mode (Swagger/API docs still available).');
    } else {
      logger.info('✓ All database connections are OK');
    }

    // Run migrations if enabled (default: true)
    const runMigrations = process.env.RUN_MIGRATIONS !== 'false';
    if (runMigrations) {
      try {
        // Check if user management tables exist
        const tablesCheck = await checkTablesExist();
        
        if (!tablesCheck.exists) {
          logger.info('Running user management migrations...');
          logger.info(`Missing tables: ${tablesCheck.missing.join(', ')}`);
          
          const migrationSuccess = await runUserManagementMigrations();
          if (!migrationSuccess) {
            logger.warn('Some user management migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ User management tables already exist, skipping migrations');
        }

        // Always run reporting migrations (all are idempotent with IF NOT EXISTS)
        logger.info('Running reporting migrations...');
        const reportingMigrationSuccess = await runReportingMigrations();
        if (!reportingMigrationSuccess) {
          logger.warn('Some reporting migrations failed, but continuing...');
        }

        // Check if activity log tables exist
        const activityLogTablesCheck = await checkActivityLogTablesExist();
        
        if (!activityLogTablesCheck.exists) {
          logger.info('Running activity log migrations...');
          logger.info(`Missing activity log tables: ${activityLogTablesCheck.missing.join(', ')}`);
          
          const activityLogMigrationSuccess = await runActivityLogMigrations();
          if (!activityLogMigrationSuccess) {
            logger.warn('Some activity log migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ Activity log tables already exist, skipping migrations');
        }

        // Check if registration tables exist
        const registrationTablesCheck = await checkRegistrationTablesExist();
        
        if (!registrationTablesCheck.exists) {
          logger.info('Running registration migrations...');
          logger.info(`Missing registration tables: ${registrationTablesCheck.missing.join(', ')}`);
          
          const registrationMigrationSuccess = await runRegistrationMigrations();
          if (!registrationMigrationSuccess) {
            logger.warn('Some registration migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ Registration tables already exist, skipping migrations');
        }

        // Check if conduct tables exist
        const conductTablesCheck = await checkConductTablesExist();
        
        if (!conductTablesCheck.exists) {
          logger.info('Running conduct migrations...');
          logger.info(`Missing conduct tables: ${conductTablesCheck.missing.join(', ')}`);
          
          const conductMigrationSuccess = await runConductMigrations();
          if (!conductMigrationSuccess) {
            logger.warn('Some conduct migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ Conduct tables already exist, skipping migrations');
        }

        // Check if procurement tables exist
        const procurementTablesCheck = await checkProcurementTablesExist();
        
        if (!procurementTablesCheck.exists) {
          logger.info('Running procurement migrations...');
          logger.info(`Missing procurement tables: ${procurementTablesCheck.missing.join(', ')}`);
          
          const procurementMigrationSuccess = await runProcurementMigrations();
          if (!procurementMigrationSuccess) {
            logger.warn('Some procurement migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ Procurement tables already exist, skipping migrations');
        }

        // Check if room management tables exist
        const roomManagementTablesCheck = await checkRoomManagementTablesExist();
        
        if (!roomManagementTablesCheck.exists) {
          logger.info('Running room management migrations...');
          logger.info(`Missing room management tables: ${roomManagementTablesCheck.missing.join(', ')}`);
          
          const roomManagementMigrationSuccess = await runRoomManagementMigrations();
          if (!roomManagementMigrationSuccess) {
            logger.warn('Some room management migrations failed, but continuing...');
          }
        } else {
          logger.info('✓ Room management tables already exist, skipping migrations');
        }

        // Run unified migrations (handles both SQL and JS migrations with pgmigrations tracking)
        // This will run pending migrations that are tracked in pgmigrations table
        logger.info('\n🔄 Running unified migrations (SQL & JS) with pgmigrations tracking...');
        try {
          const modules = getAllModuleNames();
          logger.info(`  Checking ${modules.length} module(s) for pending migrations...`);
          
          for (const moduleName of modules) {
            try {
              const status = await getMigrationStatus(moduleName);
              if (!status.exists) {
                logger.debug(`  ⊘ ${moduleName}: No migrations directory`);
                continue; // Skip if migrations directory doesn't exist
              }

              logger.debug(`  ${moduleName}: ${status.total} total, ${status.executed} executed, ${status.pending} pending`);

              // Check for pending migrations (both SQL and JS)
              const pendingMigrations = status.migrations.filter(m => !m.executed);
              
              if (pendingMigrations.length > 0) {
                logger.info(`\n  📦 Running migrations for ${moduleName} (${pendingMigrations.length} pending)...`);
                
                // Separate SQL and JS migrations
                const pendingSQL = pendingMigrations.filter(m => m.type === 'sql');
                const pendingJS = pendingMigrations.filter(m => m.type === 'js');
                
                if (pendingSQL.length > 0) {
                  logger.info(`    📄 ${pendingSQL.length} SQL migration(s) pending`);
                }
                if (pendingJS.length > 0) {
                  logger.info(`    📝 ${pendingJS.length} JS migration(s) pending: ${pendingJS.map(m => m.name).join(', ')}`);
                }
                
                // Run SQL migrations via unified runner
                if (pendingSQL.length > 0) {
                  logger.info(`    Running SQL migrations for ${moduleName}...`);
                  const unifiedResult = await runUnifiedMigrations(moduleName);
                  
                  if (unifiedResult.success) {
                    logger.info(`    ✓ SQL migrations completed for ${moduleName}`);
                  } else {
                    logger.warn(`    ⚠ Some SQL migrations failed for ${moduleName}`);
                  }
                }
                
                // Run JS migrations via node-pg-migrate
                if (pendingJS.length > 0) {
                  logger.info(`    Running JS migrations for ${moduleName}...`);
                  
                  try {
                    const config = getModuleConfig(moduleName);
                    const migrationsDir = path.join(__dirname, config.migrationsDir);
                    
                    // Ensure directory exists
                    if (!fs.existsSync(migrationsDir)) {
                      logger.error(`    ✗ Migrations directory not found: ${migrationsDir}`);
                      continue;
                    }
                    
                    logger.debug(`    Using migrations dir: ${migrationsDir}`);
                    logger.debug(`    Database: ${config.connectionString.split('@')[1] || 'N/A'}`);
                    
                    const migrationOptions = {
                      databaseUrl: config.connectionString,
                      dir: migrationsDir,
                      direction: 'up',
                      migrationsTable: config.migrationsTable,
                      dryRun: false,
                      verbose: true, // Enable verbose untuk debugging
                      log: (msg) => {
                        // Log semua messages dari node-pg-migrate
                        if (msg && typeof msg === 'string') {
                          logger.info(`      ${msg.trim()}`);
                        }
                      }
                    };

                    logger.info(`    Executing node-pg-migrate for ${moduleName}...`);
                    
                    // Gunakan createRequire untuk import CommonJS module (node-pg-migrate)
                    // karena dynamic import ES module mungkin tidak kompatibel dengan CommonJS
                    const require = createRequire(import.meta.url);
                    const nodePgMigrateModule = require('node-pg-migrate');
                    
                    // node-pg-migrate bisa export sebagai function langsung atau object dengan default
                    let nodePgMigrate;
                    if (typeof nodePgMigrateModule === 'function') {
                      nodePgMigrate = nodePgMigrateModule;
                    } else if (nodePgMigrateModule && typeof nodePgMigrateModule.default === 'function') {
                      nodePgMigrate = nodePgMigrateModule.default;
                    } else {
                      logger.error(`    Cannot find node-pg-migrate function. Type: ${typeof nodePgMigrateModule}`);
                      if (nodePgMigrateModule && typeof nodePgMigrateModule === 'object') {
                        logger.error(`    Keys: ${Object.keys(nodePgMigrateModule).join(', ')}`);
                      }
                      throw new Error(`node-pg-migrate is not a function. Type: ${typeof nodePgMigrateModule}`);
                    }
                    
                    logger.debug(`    ✓ node-pg-migrate loaded successfully (type: ${typeof nodePgMigrate})`);
                    
                    const result = await nodePgMigrate(migrationOptions);
                    
                    if (result && result.length > 0) {
                      logger.info(`    ✓ JS migrations completed for ${moduleName}: ${result.length} migration(s) executed`);
                      result.forEach((migration, idx) => {
                        logger.info(`      ${idx + 1}. ${migration.name}`);
                      });
                    } else {
                      logger.info(`    ✓ No JS migrations to run for ${moduleName} (all up-to-date)`);
                    }
                  } catch (jsError) {
                    logger.error(`    ✗ JS migration failed for ${moduleName}:`, jsError.message);
                    if (jsError.stack) {
                      logger.error(`      Error stack:`, jsError.stack);
                    }
                    // Log full error object untuk debugging
                    logger.error(`      Full error:`, JSON.stringify(jsError, Object.getOwnPropertyNames(jsError)));
                    // Continue with other modules instead of stopping
                  }
                }
              } else {
                logger.debug(`  ✓ ${moduleName}: All migrations up-to-date`);
              }
            } catch (moduleError) {
              logger.error(`  ✗ Error checking/running migrations for ${moduleName}:`, moduleError.message);
              logger.error(`    Error stack:`, moduleError.stack);
              // Continue with other modules
            }
          }
          logger.info('\n✓ Unified migrations check completed');
        } catch (unifiedError) {
          logger.error('✗ Error during unified migrations:', unifiedError.message);
          logger.error('  Error stack:', unifiedError.stack);
          // Don't exit, just log error - migration might have already run
        }
      } catch (error) {
        logger.error('Error during migration:', error);
        // Don't exit, just log error - migration might have already run
        logger.warn('Continuing despite migration error...');
      }
    } else {
      logger.info('Migrations disabled (RUN_MIGRATIONS=false)');
    }

    // Initialize Redis (optional, tidak fail jika Redis tidak tersedia)
    await createRedisClient();

    // Initialize upload directory
    await initializeUploadDir();
    logger.info('✓ Upload directory initialized');

    // Run bootstrap script if enabled (default: true)
    const runBootstrap = process.env.RUN_BOOTSTRAP !== 'false';
    if (runBootstrap) {
      try {
        // Dynamic import untuk menghindari masalah saat build
        const { bootstrapKaurLab } = await import('./scripts/bootstrap-kaur-lab.js');
        const { bootstrapActivePeriode } = await import('./scripts/bootstrap-active-periode.js');
        logger.info('Running bootstrap script...');
        const bootstrapResult = await bootstrapKaurLab();
        if (bootstrapResult.success && !bootstrapResult.skipped) {
          logger.info('✓ Bootstrap completed successfully');
        } else if (bootstrapResult.skipped) {
          logger.info('✓ Bootstrap skipped (already exists or not configured)');
        }

        const activePeriodeBootstrap = await bootstrapActivePeriode();
        if (activePeriodeBootstrap.success && !activePeriodeBootstrap.skipped) {
          logger.info('✓ Active periode dev bootstrap completed');
        } else if (activePeriodeBootstrap.skipped) {
          logger.info('✓ Active periode bootstrap skipped (already exists or not development)');
        }
      } catch (error) {
        logger.error('Error during bootstrap:', error);
        // Don't exit, just log error - bootstrap might have already run
        logger.warn('Continuing despite bootstrap error...');
      }
    } else {
      logger.info('Bootstrap disabled (RUN_BOOTSTRAP=false)');
    }

    try {
      const handoverMod = await import('./modules/procurement/services/handoverService.js');
      const handoverListener = await handoverMod.initializeHandoverListener();
      if (handoverListener?.started) {
        logger.info('✓ Procurement handover listener initialized');
      } else {
        logger.info(`Procurement handover listener not started (${handoverListener?.reason || 'unknown'})`);
      }
    } catch (handoverErr) {
      logger.warn(`Procurement handover listener skipped: ${handoverErr?.message || handoverErr}`);
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

      if (process.env.PROCUREMENT_PDF_WARMUP !== 'false') {
        import('./modules/procurement/services/pdfService.js')
          .then((pdfMod) => pdfMod.warmupPdfBrowser?.())
          .then((ok) => {
            if (ok) logger.info('✓ Procurement PDF browser warmed up');
          })
          .catch((warmErr) => {
            logger.warn(`Procurement PDF warmup skipped: ${warmErr?.message || warmErr}`);
          });
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;

