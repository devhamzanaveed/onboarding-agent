import { Module } from '@nestjs/common';
import { OpenAiModule } from '../openai/index.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [OpenAiModule],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
