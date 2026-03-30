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
    const generatedTasks =
      relevantChunks.length > 0
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

    // Check if user is behind — suggest replan
    const shouldReplan = await this.evaluateProgress(slackId);

    return { day: nextDay, totalDays, tasks, shouldReplan };
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

    return {
      task: updated,
      dayTasks,
      day: task.day,
      totalDays: task.plan.totalDays,
    };
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
      percent:
        totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      byDay,
    };
  }

  /** Answer a question using Agentic RAG (LLM decides what to search) */
  async askQuestion(question: string) {
    // Check if we have ANY documents — if not, skip the agent entirely
    const docCount = await this.prisma.document.count();
    if (docCount === 0) {
      return {
        answer:
          "I don't have any company knowledge yet. Upload documents first by DMing files to the bot.",
        citations: [] as string[],
        searches: [] as string[],
        confidence: 0,
      };
    }

    // Pass the search function to the agent — it decides when and what to search
    return this.openAi.agenticAnswer(
      question,
      async (query: string) => {
        const results = await this.knowledge.searchWithThreshold(query, 5, 0.3);
        return results.map((r) => ({
          content: r.content,
          filename: r.filename,
          similarity: r.similarity,
        }));
      },
    );
  }

  /** Check if user is behind schedule (< 40% completion on past days) */
  async evaluateProgress(slackId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: {
        onboardingPlan: {
          include: { tasks: true },
        },
      },
    });

    if (!user?.onboardingPlan) return false;

    const { currentDay, tasks } = user.onboardingPlan;
    const pastTasks = tasks.filter((t: any) => t.day < currentDay);
    if (pastTasks.length === 0) return false;

    const completedCount = pastTasks.filter((t: any) => t.completed).length;
    const completionRate = completedCount / pastTasks.length;

    return completionRate < 0.4;
  }

  /** Replan remaining days based on progress */
  async replan(slackId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: {
        onboardingPlan: {
          include: { tasks: { orderBy: { day: 'asc' } } },
        },
      },
    });

    if (!user?.onboardingPlan) {
      return { error: 'no_plan' as const };
    }

    const plan = user.onboardingPlan;
    const currentDay = plan.currentDay;
    const allTasks = plan.tasks as any[];

    // Separate completed vs incomplete tasks for past/current days
    const pastTasks = allTasks.filter((t) => t.day <= currentDay);
    const completedTasks = pastTasks.filter((t) => t.completed);
    const incompleteTasks = pastTasks.filter((t) => !t.completed);
    const remainingDays = plan.totalDays - currentDay;

    if (remainingDays <= 0) {
      return { error: 'plan_complete' as const };
    }

    // Snapshot current tasks before replan
    await this.prisma.planRevision.create({
      data: {
        planId: plan.id,
        reason,
        snapshot: allTasks as any,
      },
    });

    // Get RAG context if available
    const relevantChunks = await this.knowledge.searchWithThreshold(
      `onboarding plan for ${user.role}`,
      5,
      0.3,
    );

    // Generate new tasks for remaining days
    const newTasks = await this.openAi.replanRemainingDays(
      user.role,
      completedTasks.map((t) => ({
        title: t.title,
        description: t.description,
      })),
      incompleteTasks.map((t) => ({
        title: t.title,
        description: t.description,
      })),
      remainingDays,
      currentDay + 1,
      relevantChunks.length > 0
        ? relevantChunks.map((c) => c.content)
        : undefined,
    );

    // Delete future tasks and insert new ones
    await this.prisma.task.deleteMany({
      where: { planId: plan.id, day: { gt: currentDay } },
    });

    await this.prisma.task.createMany({
      data: newTasks.map((t) => ({
        planId: plan.id,
        day: t.day,
        title: t.title,
        description: t.description,
        resources: (t.resources ?? []) as any,
      })),
    });

    // Return next day's new tasks
    const nextDayTasks = await this.prisma.task.findMany({
      where: { planId: plan.id, day: currentDay + 1 },
      orderBy: { createdAt: 'asc' },
    });

    this.logger.log(
      `Replanned for ${user.name}: ${newTasks.length} new tasks (reason: ${reason})`,
    );

    return {
      nextDay: currentDay + 1,
      totalDays: plan.totalDays,
      tasks: nextDayTasks,
      newTaskCount: newTasks.length,
    };
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

  /** List all employees with their progress (for dashboard) */
  async listAllEmployees() {
    const users = await this.prisma.user.findMany({
      include: {
        onboardingPlan: {
          include: { tasks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user: any) => {
      const plan = user.onboardingPlan;
      if (!plan) {
        return { ...user, plan: null, progress: 0 };
      }
      const total = plan.tasks.length;
      const completed = plan.tasks.filter((t: any) => t.completed).length;
      return {
        id: user.id,
        slackId: user.slackId,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        currentDay: plan.currentDay,
        totalDays: plan.totalDays,
        completedTasks: completed,
        totalTasks: total,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });
  }

  /** Get detailed employee info with all tasks grouped by day (for dashboard) */
  async getEmployeeDetail(slackId: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackId },
      include: {
        onboardingPlan: {
          include: {
            tasks: { orderBy: { day: 'asc' } },
            revisions: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!user?.onboardingPlan) return null;

    const plan = user.onboardingPlan as any;
    const tasks = plan.tasks;

    // Group tasks by day
    const days: Array<{ day: number; tasks: any[] }> = [];
    for (let d = 1; d <= plan.totalDays; d++) {
      days.push({
        day: d,
        tasks: tasks.filter((t: any) => t.day === d),
      });
    }

    return {
      user: {
        id: user.id,
        slackId: user.slackId,
        name: user.name,
        role: user.role,
      },
      currentDay: plan.currentDay,
      totalDays: plan.totalDays,
      days,
      revisionCount: plan.revisions.length,
    };
  }
}
