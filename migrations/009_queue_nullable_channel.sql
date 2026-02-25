-- Migration 009: Make channel_id nullable on youtube_ingestion_queue
-- Required for playlist-sourced videos which don't have a channel_id
-- Videos can now come from either a channel (channel_id) or a playlist (playlist_source_id)

ALTER TABLE youtube_ingestion_queue ALTER COLUMN channel_id DROP NOT NULL;
