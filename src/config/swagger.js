/**
 * Swagger/OpenAPI documentation configuration
 * Provides API documentation for all endpoints
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Selorg Admin Operations API',
      version: process.env.API_VERSION || '1.0.0',
      description: 'Multi-Dashboard Operations Platform API Documentation',
      contact: {
        name: 'API Support',
        email: 'support@selorg.com',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Development server',
      },
      {
        url: 'https://api.selorg.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
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
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'HTTP_404',
                },
                message: {
                  type: 'string',
                  example: 'Resource not found',
                },
                details: {
                  type: 'object',
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                requestId: {
                  type: 'string',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
                version: {
                  type: 'string',
                },
              },
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
            data: {
              type: 'object',
            },
            meta: {
              type: 'object',
              properties: {
                requestId: {
                  type: 'string',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
                version: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
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
  apis: ['./src/**/*.js', './src/**/routes/*.js'], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
