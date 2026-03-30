import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

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

  /** Replan remaining days based on progress */
  async replanRemainingDays(
    role: string,
    completedTasks: Array<{ title: string; description: string }>,
    incompleteTasks: Array<{ title: string; description: string }>,
    remainingDays: number,
    startDay: number,
    contextChunks?: string[],
  ): Promise<GeneratedTask[]> {
    const context = contextChunks?.length
      ? `\n--- COMPANY KNOWLEDGE ---\n${contextChunks.join('\n\n')}\n--- END ---\n`
      : '';

    const completedSummary =
      completedTasks.length > 0
        ? completedTasks.map((t) => `- ✅ ${t.title}`).join('\n')
        : '(none)';

    const incompleteSummary =
      incompleteTasks.length > 0
        ? incompleteTasks
            .map((t) => `- ❌ ${t.title}: ${t.description}`)
            .join('\n')
        : '(none)';

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an onboarding specialist adapting a plan based on progress.
${context}
The employee (${role}) has completed some tasks and skipped others. Create a revised plan for their remaining ${remainingDays} days (days ${startDay} to ${startDay + remainingDays - 1}).

COMPLETED TASKS:
${completedSummary}

INCOMPLETE/SKIPPED TASKS:
${incompleteSummary}

Rules:
- Do NOT repeat completed tasks
- Redistribute important incomplete tasks into the remaining days
- Keep tasks practical and progressive
- Each task MUST have a "resources" array with at least 1 resource

Return JSON:
{
  "tasks": [
    {
      "day": ${startDay},
      "title": "Task title",
      "description": "What to do",
      "resources": [{ "label": "resource name", "type": "doc|link|channel|tool|command" }]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Create a revised ${remainingDays}-day plan starting from day ${startDay} for a ${role}.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const parsed = JSON.parse(content) as { tasks: GeneratedTask[] };
    return parsed.tasks;
  }

  /** Answer a question using provided context chunks, with source citations */
  async answerWithCitations(
    question: string,
    chunks: Array<{ content: string; filename: string }>,
  ): Promise<{ answer: string; citations: string[] }> {
    const numberedContext = chunks
      .map((c, i) => `[${i + 1}] (Source: ${c.filename})\n${c.content}`)
      .join('\n\n---\n\n');

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are a helpful company assistant. Answer the question using ONLY the provided context.
If the answer is not in the context, say so honestly.

Cite your sources using [1], [2], etc. matching the source numbers provided.

--- CONTEXT ---
${numberedContext}
--- END CONTEXT ---`,
        },
        { role: 'user', content: question },
      ],
    });

    const answer =
      response.choices[0]?.message?.content ?? 'No answer generated.';

    // Extract unique filenames that were actually cited
    const citedNumbers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) =>
      parseInt(m[1]),
    );
    const citations = [...new Set(citedNumbers)]
      .filter((n) => n >= 1 && n <= chunks.length)
      .map((n) => chunks[n - 1].filename);

    return { answer, citations };
  }

  /**
   * Agentic RAG: LLM decides what to search, evaluates results, and can search again.
   * Uses OpenAI Tool Calling — the LLM calls our search_knowledge function.
   */
  async agenticAnswer(
    question: string,
    searchFn: (query: string) => Promise<Array<{ content: string; filename: string; similarity: number }>>,
  ): Promise<{ answer: string; citations: string[]; searches: string[]; confidence: number }> {
    const logger = new Logger('AgenticRAG');

    // ─── STEP 1: Define the tools the LLM can call ───
    const tools: ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'search_knowledge',
          description:
            'Search the company knowledge base. Returns relevant document chunks ranked by similarity. Use specific queries for best results.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Search query — be specific. e.g. "deployment process" not "how do things work"',
              },
            },
            required: ['query'],
          },
        },
      },
    ];

    // ─── STEP 2: Initialize the conversation ───
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a company knowledge assistant. Answer questions by searching the knowledge base.

RULES:
1. ALWAYS search before answering — never answer from your own knowledge
2. If your first search doesn't fully answer the question, search again with DIFFERENT terms
3. Maximum 3 searches — then answer with what you have
4. ONLY use information from search results — if it's not in the results, say "I don't have information about that"
5. Cite sources as [filename.md] inline in your answer
6. After your answer, rate your confidence (0.0 to 1.0) that the answer is fully supported by sources

When you're ready to answer, respond with JSON:
{
  "answer": "Your answer with [filename.md] citations inline",
  "confidence": 0.85
}`,
      },
      {
        role: 'user',
        content: question,
      },
    ];

    // ─── STEP 3: Agent loop — LLM decides search vs answer ───
    const searches: string[] = []; // track what was searched
    const allChunks: Array<{ content: string; filename: string }> = [];
    const MAX_ITERATIONS = 4; // 3 searches + 1 final answer

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      logger.log(`Iteration ${i + 1}: sending ${messages.length} messages to LLM`);

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        tools,
        messages,
      });

      const choice = response.choices[0];
      const message = choice.message;

      // ─── PATH A: LLM wants to call a tool (search) ───
      if (choice.finish_reason === 'tool_calls' && message.tool_calls?.length) {
        // Add the assistant's tool_call message to history
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const fnCall = toolCall as { id: string; type: 'function'; function: { name: string; arguments: string } };
          const args = JSON.parse(fnCall.function.arguments) as { query: string };
          const searchQuery = args.query;
          searches.push(searchQuery);

          logger.log(`Search ${searches.length}: "${searchQuery}"`);

          // Execute the actual vector search
          const results = await searchFn(searchQuery);

          // Format results for the LLM
          const toolResponse =
            results.length > 0
              ? results
                  .map(
                    (r, idx) =>
                      `[Result ${idx + 1}] (Source: ${r.filename}, similarity: ${r.similarity.toFixed(2)})\n${r.content}`,
                  )
                  .join('\n\n---\n\n')
              : 'No relevant results found for this query. Try different search terms.';

          // Feed search results back to the LLM as a tool response
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResponse,
          });

          // Collect chunks for citation tracking
          allChunks.push(
            ...results.map((r) => ({ content: r.content, filename: r.filename })),
          );
        }

        continue; // Back to top of loop — LLM decides: search again or answer
      }

      // ─── PATH B: LLM is ready to answer (no tool calls) ───
      const content = message.content ?? '';
      logger.log(`Agent answered after ${searches.length} search(es)`);

      // Try to parse as JSON (structured response with confidence)
      try {
        const parsed = JSON.parse(content);
        const answer = parsed.answer ?? content;
        const confidence = parsed.confidence ?? 0.5;

        // Extract cited filenames from the answer
        const citedFiles = [
          ...new Set(
            [...answer.matchAll(/\[([^\]]+\.md)\]/g)].map((m: RegExpMatchArray) => m[1]),
          ),
        ];

        return { answer, citations: citedFiles, searches, confidence };
      } catch {
        // LLM didn't return JSON — use raw text
        const citedFiles = [
          ...new Set(
            [...content.matchAll(/\[([^\]]+\.md)\]/g)].map((m: RegExpMatchArray) => m[1]),
          ),
        ];

        return { answer: content, citations: citedFiles, searches, confidence: 0.5 };
      }
    }

    // Exhausted iterations without a final answer
    return {
      answer: "I searched the knowledge base but couldn't find a complete answer. Try rephrasing your question.",
      citations: [],
      searches,
      confidence: 0,
    };
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
