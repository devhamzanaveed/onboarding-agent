import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/index.js';
import { OpenAiService } from '../openai/index.js';
import { KnowledgeService } from '../knowledge/index.js';
import type { Task } from '../../generated/prisma/client.js';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private openAi: OpenAiService,
    private knowledge: KnowledgeService,
  ) {}

  /**
   * Creates a user, generates an AI onboarding plan (with RAG if knowledge exists),
   * and stores tasks in DB. Returns Day 1 tasks for immediate Slack message.
   */
  async startOnboarding(slackId: string, name: string, role: string) {
    // Upsert user
    const user = await this.prisma.user.upsert({
      where: { slackId },
      update: { role, name },
      create: { slackId, name, role },
    });

    // Search knowledge base for relevant context
    this.logger.log(`Generating onboarding plan for ${name} (${role})`);
    const relevantChunks = await this.knowledge.searchWithThreshold(
      `onboarding plan for ${role}`,
      10,
      0.3,
    );

    // Generate plan — with RAG context if available, plain otherwise
    const generatedTasks = relevantChunks.length > 0
      ? await this.openAi.generateOnboardingPlanWithContext(
          role,
          relevantChunks.map((c) => c.content),
        )
      : await this.openAi.generateOnboardingPlan(role);

    this.logger.log(
      `Generated plan using ${relevantChunks.length > 0 ? 'RAG' : 'basic'} mode (${relevantChunks.length} chunks)`,
    );

    // Delete existing plan + tasks, then create new ones in a transaction
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({
        where: { plan: { userId: user.id } },
      });
      await tx.onboardingPlan.deleteMany({
        where: { userId: user.id },
      });

      return tx.onboardingPlan.create({
        data: {
          userId: user.id,
          totalDays: 7,
          tasks: {
            create: generatedTasks.map((t) => ({
              day: t.day,
              title: t.title,
              description: t.description,
              resources: (t.resources ?? []) as any,
            })),
          },
        },
        include: { tasks: true },
      });
    });

    this.logger.log(
      `Created plan ${plan.id} with ${plan.tasks.length} tasks for user ${user.id}`,
    );

    return {
      user,
      plan,
      day1Tasks: plan.tasks.filter((t) => t.day === 1),
    };
  }

  /** Advance to the next day and return its tasks */
  async advanceDay(slackId: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: { onboardingPlan: true },
    });

    if (!user?.onboardingPlan) {
      return { error: 'no_plan' as const };
    }

    const { currentDay, totalDays, id: planId } = user.onboardingPlan;

    if (currentDay >= totalDays) {
      return { error: 'plan_complete' as const };
    }

    const nextDay = currentDay + 1;

    await this.prisma.onboardingPlan.update({
      where: { id: planId },
      data: { currentDay: nextDay },
    });

    const tasks = await this.prisma.task.findMany({
      where: { planId, day: nextDay },
      orderBy: { createdAt: 'asc' },
    });

    return { day: nextDay, totalDays, tasks };
  }

  /** Get tasks for a specific day */
  async getTasksForDay(slackId: string, day: number): Promise<Task[]> {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: {
        onboardingPlan: {
          include: { tasks: { where: { day }, orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    return user?.onboardingPlan?.tasks ?? [];
  }
}
