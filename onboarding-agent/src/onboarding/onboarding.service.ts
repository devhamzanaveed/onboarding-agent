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

  /** Toggle task completion status */
  async toggleTask(taskId: string, slackId: string) {
    // Verify task belongs to this user
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { plan: { include: { user: true } } },
    });

    if (!task || task.plan.user.slackId !== slackId) {
      return null;
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        completed: !task.completed,
        completedAt: task.completed ? null : new Date(),
      },
    });

    // Get all tasks for the same day to return updated view
    const dayTasks = await this.prisma.task.findMany({
      where: { planId: task.planId, day: task.day },
      orderBy: { createdAt: 'asc' },
    });

    return { task: updated, dayTasks, day: task.day, totalDays: task.plan.totalDays };
  }

  /** Get overall progress for a user */
  async getProgress(slackId: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: {
        onboardingPlan: {
          include: { tasks: { orderBy: { day: 'asc' } } },
        },
      },
    });

    if (!user?.onboardingPlan) {
      return null;
    }

    const { onboardingPlan: plan } = user;
    const tasks = plan.tasks;
    const totalCount = tasks.length;
    const completedCount = tasks.filter((t) => t.completed).length;

    // Group by day
    const byDay: Array<{ day: number; completed: number; total: number }> = [];
    for (let d = 1; d <= plan.totalDays; d++) {
      const dayTasks = tasks.filter((t) => t.day === d);
      byDay.push({
        day: d,
        completed: dayTasks.filter((t) => t.completed).length,
        total: dayTasks.length,
      });
    }

    return {
      name: user.name,
      role: user.role,
      currentDay: plan.currentDay,
      totalDays: plan.totalDays,
      completedCount,
      totalCount,
      percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      byDay,
    };
  }

  /** Answer a question using RAG */
  async askQuestion(question: string) {
    const results = await this.knowledge.searchWithThreshold(question, 5, 0.3);

    if (results.length === 0) {
      return {
        answer: "I don't have enough company knowledge to answer that. Try uploading relevant documents first.",
        citations: [] as string[],
      };
    }

    const chunks = results.map((r) => ({
      content: r.content,
      filename: r.filename,
    }));

    return this.openAi.answerWithCitations(question, chunks);
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
