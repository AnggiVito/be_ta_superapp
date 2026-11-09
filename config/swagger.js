import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUiExpress from 'swagger-ui-express';

const { serve, setup } = swaggerUiExpress;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FRI Super App Backend API',
      version: '1.0.0',
      description: 'API Documentation untuk FRI Super App Backend - Modular Monolith',
      contact: {
        name: 'FRI Super App Team',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'API server',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token dari AUTH GATEWAY',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Success message',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './modules/**/routes.js',
    './modules/**/swagger.js',
    './app.js',
    './modules/user-management/swagger.js',
    './modules/procurement/swagger.js',
    './modules/reporting/swaggerFeedbackSchemas.js',
    './modules/reporting/swaggerFeedbackLegacyPaths.js',
    './modules/reporting/swaggerFeedbackLegacyReviewPaths.js',
    './modules/reporting/swaggerConductReporting.js',
    './modules/reporting/swaggerKeuanganKpa.js',
    './modules/reporting/swaggerKeuanganLaboranCompare.js',
    './modules/activity-log/swagger.js',
  ],
};



const swaggerUi = {
  serve,
  setup,
};


const swaggerSpec = swaggerJsdoc(options);

export { swaggerSpec, swaggerUi };

