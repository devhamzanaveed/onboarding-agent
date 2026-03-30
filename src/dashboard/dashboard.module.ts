import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/index.js';
import { DashboardController } from './dashboard.controller.js';

@Module({
  imports: [OnboardingModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
