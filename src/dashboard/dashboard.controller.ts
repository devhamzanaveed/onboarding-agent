import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { OnboardingService } from '../onboarding/index.js';
import { PrismaService } from '../prisma/index.js';

@Controller('api')
export class DashboardController {
  constructor(
    private onboarding: OnboardingService,
    private prisma: PrismaService,
  ) {}

  /** List all employees with progress summary */
  @Get('employees')
  async listEmployees() {
    return this.onboarding.listAllEmployees();
  }

  /** Get detailed employee info with tasks grouped by day */
  @Get('employees/:slackId')
  async getEmployee(@Param('slackId') slackId: string) {
    return this.onboarding.getEmployeeDetail(slackId);
  }

  /** Trigger replan for an employee */
  @Post('employees/:slackId/replan')
  async replanEmployee(
    @Param('slackId') slackId: string,
    @Body('reason') reason?: string,
  ) {
    return this.onboarding.replan(slackId, reason ?? 'dashboard_triggered');
  }

  /** Aggregate stats */
  @Get('stats')
  async getStats() {
    const employees = await this.onboarding.listAllEmployees();
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(
      (e: any) => e.progress < 100,
    ).length;
    const avgProgress =
      totalEmployees > 0
        ? Math.round(
            employees.reduce((sum: number, e: any) => sum + e.progress, 0) /
              totalEmployees,
          )
        : 0;

    const documents = await this.prisma.document.count();

    return {
      totalEmployees,
      activeEmployees,
      completedEmployees: totalEmployees - activeEmployees,
      avgProgress,
      totalDocuments: documents,
    };
  }

  /** List all knowledge documents */
  @Get('documents')
  async listDocuments() {
    return this.prisma.document.findMany({
      select: {
        id: true,
        filename: true,
        mimeType: true,
        uploadedBy: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
