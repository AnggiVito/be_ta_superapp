/**
 * @swagger
 * tags:
 *   - name: Reporting - Feedback
 *     description: API untuk feedback reporting dan sentiment analysis
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FeedbackUpload:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         file_name:
 *           type: string
 *           example: "feedback_aslab_2024.xlsx"
 *         file_path:
 *           type: string
 *           example: "uploads/feedback/feedback-1234567890.xlsx"
 *         file_size:
 *           type: integer
 *           example: 45678
 *         uploaded_by:
 *           type: string
 *           format: uuid
 *         uploaded_at:
 *           type: string
 *           format: date-time
 *         periode:
 *           type: string
 *           example: "2024/2025 Ganjil"
 *         status:
 *           type: string
 *           enum: [pending, processing, processed, failed]
 *           example: "processed"
 *         processed_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     FeedbackItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         upload_id:
 *           type: string
 *           format: uuid
 *         row_number:
 *           type: integer
 *           example: 2
 *         mahasiswa_nim:
 *           type: string
 *           example: "1234567890"
 *         mahasiswa_nama:
 *           type: string
 *           example: "John Doe"
 *         asisten_nama:
 *           type: string
 *           example: "Jane Smith"
 *         feedback_text:
 *           type: string
 *           example: "Asisten sangat membantu dan sabar dalam menjelaskan"
 *         sentiment:
 *           type: string
 *           enum: [positive, negative, neutral]
 *           example: "positive"
 *         sentiment_score:
 *           type: number
 *           format: float
 *           minimum: -1.0
 *           maximum: 1.0
 *           example: 0.75
 *
 *     FeedbackSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         upload_id:
 *           type: string
 *           format: uuid
 *         periode:
 *           type: string
 *           example: "2024/2025 Ganjil"
 *         total_feedback:
 *           type: integer
 *           example: 150
 *         positive_count:
 *           type: integer
 *           example: 100
 *         negative_count:
 *           type: integer
 *           example: 30
 *         neutral_count:
 *           type: integer
 *           example: 20
 *         positive_percentage:
 *           type: number
 *           format: float
 *           example: 66.67
 *         negative_percentage:
 *           type: number
 *           format: float
 *           example: 20.0
 *         neutral_percentage:
 *           type: number
 *           format: float
 *           example: 13.33
 *         average_sentiment_score:
 *           type: number
 *           format: float
 *           example: 0.45
 *           description: "Average sentiment score dari semua feedback (-1.0 to 1.0)"
 *         overall_sentiment:
 *           type: string
 *           enum: [positive, negative, neutral]
 *           example: "positive"
 *           description: "Sentimen keseluruhan dari semua feedback yang di-upload"
 *         top_positive_keywords:
 *           type: array
 *           items:
 *             type: string
 *           example: ["membantu", "sabar", "jelas", "baik", "responsif"]
 *         top_negative_keywords:
 *           type: array
 *           items:
 *             type: string
 *           example: ["lambat", "kurang", "tidak jelas"]
 *         generated_at:
 *           type: string
 *           format: date-time
 *
 *     SentimentStatistics:
 *       type: object
 *       properties:
 *         total_feedback:
 *           type: integer
 *           example: 500
 *         total_uploads:
 *           type: integer
 *           example: 5
 *         overall_positive_percentage:
 *           type: number
 *           format: float
 *           example: 65.5
 *         overall_negative_percentage:
 *           type: number
 *           format: float
 *           example: 22.3
 *         overall_neutral_percentage:
 *           type: number
 *           format: float
 *           example: 12.2
 *         average_sentiment_score:
 *           type: number
 *           format: float
 *           example: 0.42
 */
