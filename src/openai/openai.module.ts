import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service.js';

@Module({
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
