import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface TaskResource {
  label: string; // e.g. "Engineering Onboarding Guide", "#infra-requests"
  type: 'doc' | 'link' | 'channel' | 'tool' | 'command';
}

export interface GeneratedTask {
  day: number;
  title: string;
  description: string;
  resources: TaskResource[];
}

@Injectable()
export class OpenAiService {
  private client: OpenAI;

  constructor(private config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async generateOnboardingPlan(
    role: string,
    days = 7,
  ): Promise<GeneratedTask[]> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an onboarding specialist. Generate a structured ${days}-day onboarding plan.

For each task, include a "resources" array with tools, links, or references the employee needs. Each resource has:
- "label": the name (e.g. "HR Portal", "Team Wiki", "git clone")
- "type": one of "doc", "link", "channel", "tool", "command"

Return JSON in this exact format:
{
  "tasks": [
    {
      "day": 1,
      "title": "Task title",
      "description": "What the new hire should do",
      "resources": [
        { "label": "Company Handbook", "type": "doc" }
      ]
    }
  ]
}
Include 2-3 tasks per day. Each task MUST have at least 1 resource. Tasks should be practical, specific, and progressive.`,
        },
        {
          role: 'user',
          content: `Create a ${days}-day onboarding plan for a new employee with the role: ${role}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content) as { tasks: GeneratedTask[] };
    return parsed.tasks;
  }

  /** Generate onboarding plan with company knowledge as context */
  async generateOnboardingPlanWithContext(
    role: string,
    contextChunks: string[],
    days = 7,
  ): Promise<GeneratedTask[]> {
    const context = contextChunks.join('\n\n---\n\n');

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an onboarding specialist for our company. Use the following company knowledge to create a specific, relevant onboarding plan.

--- COMPANY KNOWLEDGE ---
${context}
--- END COMPANY KNOWLEDGE ---

Generate a structured ${days}-day onboarding plan. Reference specific company tools, processes, and resources mentioned in the knowledge above.

IMPORTANT: For each task, include a "resources" array listing specific documents, tools, Slack channels, commands, or links the employee needs. Each resource has:
- "label": the name (e.g. "Engineering Onboarding Guide", "#infra-requests", "make setup", "Linear", "https://github.com/acme-inc/acme-app")
- "type": one of "doc", "link", "channel", "tool", "command"

Return JSON in this exact format:
{
  "tasks": [
    {
      "day": 1,
      "title": "Task title",
      "description": "What the new hire should do",
      "resources": [
        { "label": "#engineering", "type": "channel" },
        { "label": "make setup", "type": "command" },
        { "label": "Engineering Onboarding Guide", "type": "doc" }
      ]
    }
  ]
}
Include 2-3 tasks per day. Each task MUST have at least 1 resource. Tasks should be practical, specific, and progressive.`,
        },
        {
          role: 'user',
          content: `Create a ${days}-day onboarding plan for a new employee with the role: ${role}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content) as { tasks: GeneratedTask[] };
    return parsed.tasks;
  }

  /** Generate embedding vector for a text string */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  /** Generate embeddings for multiple texts in batch */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // OpenAI allows up to 2048 inputs per batch
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}
