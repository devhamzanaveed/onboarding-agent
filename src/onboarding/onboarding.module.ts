import { Module } from '@nestjs/common';
import { OpenAiModule } from '../openai/index.js';
import { KnowledgeModule } from '../knowledge/index.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [OpenAiModule, KnowledgeModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
