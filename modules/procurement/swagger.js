const procurementSwagger = {
  components: {
    schemas: {
      SubmissionItem: {
        type: 'object',
        properties: {
          id: { type: 'integer', readOnly: true },
          submission_id: { type: 'integer', readOnly: true },
          item_name: { type: 'string' },
          specification: { type: 'string' },
          unit_price: { type: 'number' },
          quantity: { type: 'integer' },
          total_price: { type: 'number' },
          created_at: { type: 'string', format: 'date-time', readOnly: true },
          updated_at: { type: 'string', format: 'date-time', readOnly: true },
          status: { type: 'string', example: 'pending' }
        }
      },
      UpdateSubmissionItem: {
        type: 'object',
        properties: {
          item_name: { type: 'string' },
          specification: { type: 'string' },
          unit_price: { type: 'number' },
          quantity: { type: 'integer' }
        }
      },
      CreateSubmission: {
        type: 'object',
        required: ['items'],
        properties: {
          study_program_id: { type: 'string', format: 'uuid' },
          lab_id: { type: 'string', format: 'uuid' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['item_name', 'unit_price', 'quantity'],
              properties: {
                item_name: { type: 'string' },
                specification: { type: 'string' },
                unit_price: { type: 'number' },
                quantity: { type: 'integer' }
              }
            }
          },
          purpose: { type: 'string' },
          action: { type: 'string', enum: ['draft', 'submit'] }
        }
      },
      CreateDraft: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          study_program_id: { type: 'string', format: 'uuid' },
          lab_id: { type: 'string', format: 'uuid' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/SubmissionItem' }
          },
          purpose: { type: 'string' }
        }
      },
      Submission: {
        type: 'object',
        properties: {
          id: { type: 'integer', readOnly: true },
          requester_name: { type: 'string', readOnly: true },
          requester_role: { type: 'string', readOnly: true },
          study_program: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' }
            }
          },
          laboratory: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' }
            }
          },
          total_price: { type: 'number' },
          purpose: { type: 'string' },
          status: { type: 'string' },
          created_at: { type: 'string', format: 'date-time', readOnly: true },
          items: { type: 'array', items: { $ref: '#/components/schemas/SubmissionItem' } }
        }
      },
      Receipt: {
        type: 'object',
        properties: {
          id: { type: 'integer', readOnly: true },
          submission_id: { type: 'integer' },
          uploaded_by: { type: 'integer' },
          file_path: { type: 'string' },
          file_name: { type: 'string' },
          mime_type: { type: 'string' },
          realized_price: { type: 'number' },
          currency: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' }
        }
      },
      CreateReceipt: {
        type: 'object',
        properties: {
          realized_price: { type: 'number' },
          currency: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['realized_price']
      },
      StudyProgram: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' }
        }
      },
      Laboratory: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' }
        }
      }
    }
  }
};

export default procurementSwagger;

/**
 * @swagger
 * /api/procurement/submission:
 *   get:
 *     tags:
 *       - Procurement
 *     summary: Get submissions created by the authenticated user (paginated)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of submissions belonging to the caller
 */

/**
 * @swagger
 * /api/procurement/submission/{id}/handover/confirm-receipt:
 *   post:
 *     tags:
 *       - Procurement
 *     summary: Confirm receipt and generate a 4-digit code
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /api/procurement/submission/{id}/handover/verify-code:
 *   post:
 *     tags:
 *       - Procurement
 *     summary: Verify the student confirmation code and build EIP-712 payload
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /api/procurement/submission/{id}/handover/submit-signature:
 *   post:
 *     tags:
 *       - Procurement
 *     summary: Submit laboran signature and relay the blockchain transaction
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /api/procurement/submission/{id}/handover/proof:
 *   get:
 *     tags:
 *       - Procurement
 *     summary: Get immutable proof data for a handover
 *     security:
 *       - bearerAuth: []
 */
