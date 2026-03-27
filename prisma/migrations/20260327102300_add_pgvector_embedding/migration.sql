-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for text-embedding-3-small)
ALTER TABLE "DocumentChunk" ADD COLUMN embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
