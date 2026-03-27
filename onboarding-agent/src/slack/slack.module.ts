import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/index.js';
import { KnowledgeModule } from '../knowledge/index.js';
import { SlackService } from './slack.service.js';

@Module({
  imports: [OnboardingModule, KnowledgeModule],
  providers: [SlackService],
})
export class SlackModule {}
