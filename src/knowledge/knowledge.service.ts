import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { toSql } from 'pgvector';
import { PrismaService } from '../prisma/index.js';
import { OpenAiService } from '../openai/index.js';
import { chunkText } from './knowledge.chunker.js';

export interface SearchResult {
  content: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  similarity: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private prisma: PrismaService,
    private openAi: OpenAiService,
  ) {}

  /** Full ingestion pipeline: extract text → chunk → embed → store */
  async ingestDocument(
    filename: string,
    mimeType: string,
    buffer: Buffer,
    uploadedBy: string,
  ) {
    // 1. Extract text
    const rawText = await this.extractText(mimeType, buffer);
    if (!rawText.trim()) {
      throw new Error(`Could not extract text from ${filename}`);
    }

    // 2. Chunk the text
    const chunks = chunkText(rawText);
    this.logger.log(`Chunked "${filename}" into ${chunks.length} chunks`);

    // 3. Generate embeddings in batch
    const embeddings = await this.openAi.generateEmbeddings(chunks);

    // 4. Store document + chunks in a transaction
    const document = await this.prisma.document.create({
      data: {
        filename,
        mimeType,
        rawText,
        uploadedBy,
        chunks: {
          create: chunks.map((content, index) => ({
            content,
            chunkIndex: index,
          })),
        },
      },
      include: { chunks: true },
    });

    // 5. Update embeddings via raw SQL (Prisma doesn't support vector type)
    for (let i = 0; i < document.chunks.length; i++) {
      const chunk = document.chunks[i];
      const embedding = embeddings[i];
      await this.prisma.$queryRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
        toSql(embedding),
        chunk.id,
      );
    }

    this.logger.log(
      `Ingested "${filename}": ${document.chunks.length} chunks with embeddings`,
    );

    return {
      documentId: document.id,
      filename,
      chunkCount: document.chunks.length,
    };
  }

  /** Search for similar chunks using cosine similarity */
  async similaritySearch(query: string, topK = 10): Promise<SearchResult[]> {
    const queryEmbedding = await this.openAi.generateEmbedding(query);

    const results = await this.prisma.$queryRawUnsafe<
      Array<{
        content: string;
        documentId: string;
        filename: string;
        chunkIndex: number;
        similarity: number;
      }>
    >(
      `SELECT
        dc.content,
        dc."documentId",
        d.filename,
        dc."chunkIndex",
        1 - (dc.embedding <=> $1::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $2`,
      toSql(queryEmbedding),
      topK,
    );

    return results;
  }

  /** Search and return only chunks above a similarity threshold */
  async searchWithThreshold(
    query: string,
    topK = 10,
    minSimilarity = 0.3,
  ): Promise<SearchResult[]> {
    const results = await this.similaritySearch(query, topK);
    return results.filter((r) => r.similarity >= minSimilarity);
  }

  /** Extract text from buffer based on MIME type */
  private async extractText(mimeType: string, buffer: Buffer): Promise<string> {
    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }

    // Plain text, markdown, etc.
    return buffer.toString('utf-8');
  }
}
