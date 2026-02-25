-- Migration 008: Add processing_step column to youtube_ingestion_queue
-- Stores human-readable progress text during video processing
-- Used by the frontend to display live step-by-step status

ALTER TABLE youtube_ingestion_queue
  ADD COLUMN IF NOT EXISTS processing_step TEXT;

-- No index needed — only read during active processing for specific items
