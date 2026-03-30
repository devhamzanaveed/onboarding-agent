import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App } from '@slack/bolt';
import { OnboardingService } from '../onboarding/index.js';
import { KnowledgeService } from '../knowledge/index.js';
import type { Task } from '../../generated/prisma/client.js';

@Injectable()
export class SlackService implements OnModuleInit {
  private readonly logger = new Logger(SlackService.name);
  private bolt: App;

  constructor(
    private config: ConfigService,
    private onboarding: OnboardingService,
    private knowledge: KnowledgeService,
  ) {
    this.bolt = new App({
      token: this.config.getOrThrow('SLACK_BOT_TOKEN'),
      signingSecret: this.config.getOrThrow('SLACK_SIGNING_SECRET'),
      socketMode: true,
      appToken: this.config.getOrThrow('SLACK_APP_TOKEN'),
    });
  }

  async onModuleInit() {
    this.registerCommands();
    this.registerActions();
    this.registerEvents();
    await this.bolt.start();
    this.logger.log('Slack bot connected (socket mode)');
  }

  private registerCommands() {
    // /start-onboarding [role]
    this.bolt.command(
      '/start-onboarding',
      async ({ command, ack, respond, client }) => {
        await ack();

        const role = command.text?.trim();
        if (!role) {
          await respond(
            '⚠️ Please provide your role. Usage: `/start-onboarding Software Engineer`',
          );
          return;
        }

        await respond(
          `🚀 Generating your onboarding plan for *${role}*... This may take a moment.`,
        );

        try {
          const { user, day1Tasks } = await this.onboarding.startOnboarding(
            command.user_id,
            command.user_name,
            role,
          );

          // Use chat.postMessage so buttons can update the message later
          const blocks = this.formatDay1Message(user.name, role, day1Tasks);
          await client.chat.postMessage({
            channel: command.channel_id,
            blocks,
            text: `Onboarding plan for ${role}`,
          });
        } catch (error) {
          this.logger.error('Failed to start onboarding', error);
          await respond(
            '❌ Something went wrong generating your plan. Please try again.',
          );
        }
      },
    );

    // /next-day — manually advance to next day's tasks
    this.bolt.command(
      '/next-day',
      async ({ command, ack, respond, client }) => {
        await ack();

        try {
          const result = await this.onboarding.advanceDay(command.user_id);

          if ('error' in result) {
            const msg =
              result.error === 'no_plan'
                ? "⚠️ You don't have an onboarding plan yet. Run `/start-onboarding [role]` first."
                : "🎉 You've completed your entire onboarding plan! Great job!";
            await respond(msg);
            return;
          }

          const blocks = this.formatDayMessage(
            result.day,
            result.totalDays,
            result.tasks,
          );

          // If behind schedule, suggest replan
          if (result.shouldReplan) {
            blocks.push(
              { type: 'divider' as const },
              {
                type: 'section' as const,
                text: {
                  type: 'mrkdwn' as const,
                  text: '⚠️ You seem to be behind on some tasks. Want to adjust your remaining plan?',
                },
                accessory: {
                  type: 'button' as any,
                  text: { type: 'plain_text' as any, text: '🔄 Replan' },
                  action_id: 'trigger_replan',
                  style: 'danger',
                },
              },
            );
          }

          await client.chat.postMessage({
            channel: command.channel_id,
            blocks,
            text: `Day ${result.day} tasks`,
          });
        } catch (error) {
          this.logger.error('Failed to advance day', error);
          await respond('❌ Something went wrong. Please try again.');
        }
      },
    );

    // /replan — manually trigger adaptive replanning
    this.bolt.command('/replan', async ({ command, ack, respond }) => {
      await ack();

      const reason = command.text?.trim() || 'user_requested';
      await respond('🔄 Replanning your remaining days based on progress...');

      try {
        const result = await this.onboarding.replan(command.user_id, reason);

        if ('error' in result) {
          const msg =
            result.error === 'no_plan'
              ? '⚠️ No onboarding plan found. Run `/start-onboarding [role]` first.'
              : '🎉 Your plan is already complete!';
          await respond(msg);
          return;
        }

        const blocks = [
          {
            type: 'section' as const,
            text: {
              type: 'mrkdwn' as const,
              text: `✅ *Plan updated!* ${result.newTaskCount} new tasks generated for days ${result.nextDay}–${result.totalDays}.`,
            },
          },
          { type: 'divider' as const },
          ...this.formatDayMessage(
            result.nextDay,
            result.totalDays,
            result.tasks,
          ),
        ];

        await respond({ blocks, text: 'Plan replanned' });
      } catch (error) {
        this.logger.error('Failed to replan', error);
        await respond('❌ Something went wrong. Please try again.');
      }
    });

    // /progress — show completion stats
    this.bolt.command('/progress', async ({ command, ack, respond }) => {
      await ack();

      try {
        const progress = await this.onboarding.getProgress(command.user_id);

        if (!progress) {
          await respond(
            '⚠️ No onboarding plan found. Run `/start-onboarding [role]` first.',
          );
          return;
        }

        await respond({
          blocks: this.formatProgressMessage(progress),
          text: `Progress: ${progress.percent}%`,
        });
      } catch (error) {
        this.logger.error('Failed to get progress', error);
        await respond('❌ Something went wrong. Please try again.');
      }
    });

    // /ask — Agentic RAG-powered Q&A with citations
    this.bolt.command('/ask', async ({ command, ack, respond }) => {
      await ack();

      const question = command.text?.trim();
      if (!question) {
        await respond(
          '⚠️ Please provide a question. Usage: `/ask How do I set up my dev environment?`',
        );
        return;
      }

      await respond(`🤖 Agent is searching the knowledge base...`);

      try {
        const result = await this.onboarding.askQuestion(question);

        await respond({
          blocks: this.formatAnswerMessage(
            question,
            result.answer,
            result.citations,
            result.searches,
            result.confidence,
          ),
          text: result.answer,
        });
      } catch (error) {
        this.logger.error('Failed to answer question', error);
        await respond('❌ Something went wrong. Please try again.');
      }
    });
  }

  /** Handle interactive button clicks */
  private registerActions() {
    this.bolt.action('complete_task', async ({ action, ack, body, client }) => {
      await ack();

      const taskId = (action as any).value;
      const slackId = body.user.id;

      try {
        const result = await this.onboarding.toggleTask(taskId, slackId);
        if (!result) return;

        // Update the original message with new task states
        const blocks = this.formatDayMessage(
          result.day,
          result.totalDays,
          result.dayTasks,
        );
        const messageBody = body as any;

        await client.chat.update({
          channel: messageBody.channel?.id ?? messageBody.container?.channel_id,
          ts: messageBody.message?.ts ?? messageBody.container?.message_ts,
          blocks,
          text: `Day ${result.day} tasks`,
        });
      } catch (error) {
        this.logger.error('Failed to toggle task', error);
      }
    });

    // Replan button click
    this.bolt.action('trigger_replan', async ({ ack, body, client }) => {
      await ack();

      const slackId = body.user.id;
      const messageBody = body as any;
      const channel =
        messageBody.channel?.id ?? messageBody.container?.channel_id;

      try {
        await client.chat.postMessage({
          channel,
          text: '🔄 Replanning your remaining days...',
        });

        const result = await this.onboarding.replan(slackId, 'behind_schedule');

        if ('error' in result) {
          await client.chat.postMessage({
            channel,
            text: '⚠️ Could not replan.',
          });
          return;
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Plan updated!* ${result.newTaskCount} new tasks generated.`,
            },
          },
          { type: 'divider' },
          ...this.formatDayMessage(
            result.nextDay,
            result.totalDays,
            result.tasks,
          ),
        ];

        await client.chat.postMessage({
          channel,
          blocks,
          text: 'Plan replanned',
        });
      } catch (error) {
        this.logger.error('Failed to replan via button', error);
        await client.chat.postMessage({
          channel,
          text: '❌ Replan failed. Please try again.',
        });
      }
    });
  }

  /** Listen for file uploads via DM to ingest as knowledge */
  private registerEvents() {
    this.bolt.event('file_shared', async ({ event, client }) => {
      this.logger.log(`File shared event received: ${event.file_id}`);

      try {
        const fileInfo = await client.files.info({ file: event.file_id });
        const file = fileInfo.file;
        if (!file) return;

        const channel = event.channel_id;
        const channelInfo = await client.conversations.info({ channel });
        if (!channelInfo.channel?.is_im) return;

        const supported: Record<string, boolean> = {
          'application/pdf': true,
          'text/plain': true,
          'text/markdown': true,
          'text/html': true,
        };

        if (!file.mimetype || !supported[file.mimetype]) {
          await client.chat.postMessage({
            channel,
            text: `⚠️ Unsupported file type: \`${file.mimetype}\`. Supported: PDF, TXT, MD`,
          });
          return;
        }

        await client.chat.postMessage({
          channel,
          text: `📄 Processing *${file.name}*...`,
        });

        const botToken = this.config.getOrThrow('SLACK_BOT_TOKEN');
        const downloadResponse = await fetch(file.url_private_download!, {
          headers: { Authorization: `Bearer ${botToken}` },
        });
        const buffer = Buffer.from(await downloadResponse.arrayBuffer());

        const result = await this.knowledge.ingestDocument(
          file.name!,
          file.mimetype,
          buffer,
          file.user!,
        );

        await client.chat.postMessage({
          channel,
          text:
            `✅ *${file.name}* ingested successfully!\n` +
            `• ${result.chunkCount} chunks created and embedded\n` +
            `• This knowledge will now be used in onboarding plans and Q&A.`,
        });
      } catch (error) {
        this.logger.error('Failed to ingest file', error);
        await client.chat.postMessage({
          channel: event.channel_id,
          text: '❌ Failed to process the file. Please try again.',
        });
      }
    });
  }

  // ─── Formatters ─────────────────────────────────────────

  /** Format task blocks with completion buttons and resources */
  private formatTaskBlocks(tasks: Task[]) {
    const blocks: any[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const resources = (task.resources as any[]) ?? [];
      const check = task.completed ? '✅' : '⬜';
      const title = task.completed ? `~${task.title}~` : task.title;

      // Task with completion button
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${check} *${i + 1}. ${title}*\n${task.description}`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: task.completed ? 'Undo' : 'Done ✓',
          },
          action_id: 'complete_task',
          value: task.id,
          style: task.completed ? undefined : 'primary',
        },
      });

      // Resources
      if (resources.length > 0) {
        const icons: Record<string, string> = {
          doc: '📄',
          link: '🔗',
          channel: '💬',
          tool: '🛠️',
          command: '⌨️',
        };

        const resourceText = resources
          .map((r: any) => {
            const icon = icons[r.type] || '📌';
            if (r.type === 'channel' && r.label.startsWith('#'))
              return `${icon} ${r.label}`;
            if (r.type === 'command') return `${icon} \`${r.label}\``;
            if (r.type === 'link' && r.label.startsWith('http'))
              return `${icon} <${r.label}>`;
            return `${icon} ${r.label}`;
          })
          .join('  •  ');

        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: resourceText }],
        });
      }
    }

    return blocks;
  }

  private formatDay1Message(name: string, role: string, tasks: Task[]) {
    return [
      {
        type: 'header' as const,
        text: { type: 'plain_text' as const, text: `Welcome, ${name}! 🎉` },
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `Your *7-day onboarding plan* for *${role}* is ready.\nHere are your *Day 1* tasks:`,
        },
      },
      { type: 'divider' as const },
      ...this.formatTaskBlocks(tasks),
      { type: 'divider' as const },
      {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text: '💡 Click *Done ✓* to mark tasks complete. Type `/progress` to see your stats.',
          },
        ],
      },
    ];
  }

  private formatDayMessage(day: number, totalDays: number, tasks: Task[]) {
    return [
      {
        type: 'header' as const,
        text: {
          type: 'plain_text' as const,
          text: `📋 Day ${day} of ${totalDays}`,
        },
      },
      { type: 'divider' as const },
      ...this.formatTaskBlocks(tasks),
      { type: 'divider' as const },
      {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text:
              day < totalDays
                ? `Type \`/next-day\` when you're ready for Day ${day + 1}.`
                : "🎉 This is your last day — you're almost done!",
          },
        ],
      },
    ];
  }

  /** Format progress overview */
  private formatProgressMessage(progress: {
    name: string;
    role: string;
    currentDay: number;
    totalDays: number;
    completedCount: number;
    totalCount: number;
    percent: number;
    byDay: Array<{ day: number; completed: number; total: number }>;
  }) {
    const bar = this.progressBar(progress.percent);

    const dayLines = progress.byDay
      .map((d) => {
        const dayBar = d.total > 0 ? `${d.completed}/${d.total}` : '—';
        const marker = d.day === progress.currentDay ? ' ← current' : '';
        const check = d.completed === d.total && d.total > 0 ? ' ✅' : '';
        return `Day ${d.day}: ${dayBar}${check}${marker}`;
      })
      .join('\n');

    return [
      {
        type: 'header' as const,
        text: { type: 'plain_text' as const, text: `📊 Onboarding Progress` },
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*${progress.name}* — ${progress.role}\n\n${bar}  *${progress.percent}%* complete (${progress.completedCount}/${progress.totalCount} tasks)`,
        },
      },
      { type: 'divider' as const },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `\`\`\`\n${dayLines}\n\`\`\``,
        },
      },
    ];
  }

  /** Generate a text progress bar */
  private progressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /** Format Q&A answer with citations, search trail, and confidence */
  private formatAnswerMessage(
    question: string,
    answer: string,
    citations: string[],
    searches: string[] = [],
    confidence: number = 0,
  ) {
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Q: ${question}*`,
        },
      },
      { type: 'divider' },
    ];

    // Confidence warning for low-quality answers
    if (confidence > 0 && confidence < 0.5) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⚠️ _Low confidence (${Math.round(confidence * 100)}%) — this answer may not be fully accurate_`,
          },
        ],
      });
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: answer,
      },
    });

    // Sources section
    if (citations.length > 0) {
      const sourceList = [...new Set(citations)]
        .map((c) => `📄 ${c}`)
        .join('  •  ');

      blocks.push(
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `*Sources:* ${sourceList}` }],
        },
      );
    }

    // Agent search trail — shows what the AI searched for
    if (searches.length > 0) {
      const searchList = searches.map((s) => `🔍 "${s}"`).join('  →  ');
      const confidenceBar = confidence > 0
        ? `  •  Confidence: ${Math.round(confidence * 100)}%`
        : '';

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Agent trail:* ${searchList}${confidenceBar}`,
          },
        ],
      });
    }

    return blocks;
  }
}
