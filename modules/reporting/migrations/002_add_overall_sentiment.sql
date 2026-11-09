-- Migration: Add overall_sentiment column to feedback_summaries
-- Date: 2025-11-15
-- Description: Menambahkan kolom overall_sentiment untuk menyimpan sentimen keseluruhan dari feedback

-- Add overall_sentiment column
ALTER TABLE feedback_summaries 
ADD COLUMN IF NOT EXISTS overall_sentiment VARCHAR(20) CHECK (overall_sentiment IN ('positive', 'negative', 'neutral'));

-- Add index for overall_sentiment
CREATE INDEX IF NOT EXISTS idx_feedback_summaries_overall_sentiment 
ON feedback_summaries(overall_sentiment) 
WHERE deleted_at IS NULL;

-- Update existing records dengan sentimen default berdasarkan average_sentiment_score
UPDATE feedback_summaries 
SET overall_sentiment = CASE 
    WHEN average_sentiment_score > 0.15 THEN 'positive'
    WHEN average_sentiment_score < -0.15 THEN 'negative'
    ELSE 'neutral'
END
WHERE overall_sentiment IS NULL;
