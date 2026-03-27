/**
 * Splits text into overlapping chunks for embedding.
 * Uses paragraph boundaries when possible, with a sliding window fallback.
 */

const DEFAULT_CHUNK_SIZE = 500; // ~500 tokens ≈ 2000 chars
const DEFAULT_CHUNK_OVERLAP = 100; // ~100 tokens ≈ 400 chars

interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {},
): string[] {
  const maxChars = (options.chunkSize ?? DEFAULT_CHUNK_SIZE) * 4;
  const overlapChars = (options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP) * 4;

  // Normalize whitespace
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  // Split into paragraphs first
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If a single paragraph exceeds maxChars, split it by sentences
    if (paragraph.length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const sentenceChunks = splitLongText(paragraph, maxChars, overlapChars);
      chunks.push(...sentenceChunks);
      continue;
    }

    // If adding this paragraph would exceed the limit, save current and start new
    if (currentChunk.length + paragraph.length + 2 > maxChars) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap from the end of previous chunk
      const overlap = currentChunk.slice(-overlapChars);
      currentChunk = overlap + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 50); // Skip tiny fragments
}

/** Split a long text block by character boundary with overlap */
function splitLongText(
  text: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Try to break at a sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + maxChars / 2) {
        end = lastPeriod + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlapChars;
  }

  return chunks;
}
