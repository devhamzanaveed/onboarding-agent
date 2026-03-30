# AI Onboarding Agent

An AI-powered Slack bot that generates personalized onboarding plans for new employees using RAG (Retrieval-Augmented Generation) and company knowledge.

Built with NestJS, PostgreSQL + pgvector, OpenAI, and Slack Bolt SDK.

## Features

**Slack Bot Commands**
- `/start-onboarding [role]` — Generates a personalized 7-day onboarding plan using AI + company knowledge
- `/next-day` — Advance to the next day's tasks
- `/ask [question]` — Ask questions and get answers with source citations from company docs
- `/progress` — View completion stats with per-day breakdown
- `/replan` — AI regenerates remaining days based on what you completed/skipped

**Knowledge Ingestion (RAG)**
- Upload PDFs, Markdown, or text files via DM to the bot
- Documents are chunked, embedded (OpenAI `text-embedding-3-small`), and stored in pgvector
- Onboarding plans reference your actual company tools, repos, and processes

**Interactive Task Management**
- Each task has a "Done" button — click to mark complete, message updates in-place
- Completed tasks show with strikethrough and "Undo" option
- Tasks include actionable resources (docs, tools, Slack channels, commands)

**Adaptive Re-planning**
- Auto-detects when an employee falls behind (< 40% completion rate)
- Suggests replanning with a button in Slack
- AI generates revised plan factoring in completed vs skipped tasks
- Old plan is snapshotted before replan for audit trail

**Web Dashboard**
- Overview page with stats (total employees, active, avg progress, knowledge docs)
- Employee table with progress bars
- Detailed employee view with day-by-day timeline and task completion status

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Slack Bot                            │
│  /start-onboarding  /next-day  /ask  /progress  /replan  │
│  File uploads (DM) → Knowledge ingestion                  │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                   NestJS Backend                          │
│                                                           │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ SlackModule   │  │ OnboardingMod │  │ DashboardMod │  │
│  │ Bolt SDK      │  │ Plan CRUD     │  │ REST API     │  │
│  │ Socket Mode   │  │ Task tracking │  │ GET /api/*   │  │
│  └──────┬───────┘  │ Replan logic  │  └──────────────┘  │
│         │          └───────┬───────┘                      │
│         │                  │                              │
│  ┌──────▼──────────────────▼─────────────────────────┐   │
│  │              OpenAI Service                        │   │
│  │  • Plan generation (with RAG context)              │   │
│  │  • Q&A with citations                              │   │
│  │  • Adaptive re-planning                            │   │
│  │  • Embeddings (text-embedding-3-small)             │   │
│  └──────────────────────┬────────────────────────────┘   │
│                         │                                 │
│  ┌──────────────────────▼────────────────────────────┐   │
│  │            Knowledge Service                       │   │
│  │  • PDF/MD/TXT text extraction                      │   │
│  │  • Chunking (500 tokens, overlapping)              │   │
│  │  • Embedding + pgvector storage                    │   │
│  │  • Cosine similarity search                        │   │
│  └──────────────────────┬────────────────────────────┘   │
│                         │                                 │
│  ┌──────────────────────▼────────────────────────────┐   │
│  │         PostgreSQL + pgvector                      │   │
│  │  Users, OnboardingPlans, Tasks, PlanRevisions      │   │
│  │  Documents, DocumentChunks (vector embeddings)     │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │         React Dashboard (Vite)                     │   │
│  │  Served via @nestjs/serve-static                   │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11 (TypeScript, ESM) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 7 (driver adapter pattern) |
| AI | OpenAI GPT-4o-mini + text-embedding-3-small |
| Interface | Slack Bolt SDK (Socket Mode) |
| Frontend | React + Vite + TypeScript |
| Vector Search | pgvector (HNSW index, cosine similarity) |

## AI Techniques Used

- **RAG (Retrieval-Augmented Generation)** — Company documents are chunked, embedded, and stored in pgvector. Relevant chunks are retrieved via cosine similarity and injected into the LLM prompt for context-aware generation.
- **Structured Output** — OpenAI's JSON mode ensures plan generation returns typed, parseable task objects.
- **AI Agent Pattern** — Adaptive re-planning evaluates progress and autonomously adjusts the plan based on completed vs skipped tasks.
- **Embedding-based Search** — `text-embedding-3-small` (1536 dimensions) with HNSW indexing for sub-millisecond similarity search.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ with [pgvector](https://github.com/pgvector/pgvector) extension
- OpenAI API key
- Slack workspace with a configured bot (see [Slack Setup](#slack-setup))

### Quick Start (Docker)

```bash
# Clone the repo
git clone https://github.com/devhamzanaveed/onboarding-agent.git
cd onboarding-agent

# Copy env file and fill in your keys
cp .env.example .env

# Start PostgreSQL + pgvector + app
docker-compose up -d

# Run migrations
docker-compose exec app npx prisma migrate deploy
```

### Manual Setup

```bash
# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Set up database
createdb onboarding_agent
brew install pgvector  # macOS
npx prisma migrate deploy
npx prisma generate

# Build dashboard
npm run build:dashboard

# Start
npm run start:dev
```

### Slack Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Socket Mode** — generate an App-Level Token (`xapp-...`)
3. Add **Bot Token Scopes**: `chat:write`, `commands`, `files:read`, `im:history`, `im:read`
4. Create **Slash Commands**: `/start-onboarding`, `/next-day`, `/ask`, `/progress`, `/replan`
5. Enable **Event Subscriptions** — subscribe to `file_shared` bot event
6. Enable **Interactivity**
7. Install to workspace and copy tokens to `.env`

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/onboarding_agent"
OPENAI_API_KEY="sk-..."
SLACK_BOT_TOKEN="xoxb-..."
SLACK_SIGNING_SECRET="..."
SLACK_APP_TOKEN="xapp-..."
```

## Project Structure

```
├── src/
│   ├── prisma/          # Database service (Prisma 7 + pg adapter)
│   ├── openai/          # OpenAI integration (plans, embeddings, Q&A, replan)
│   ├── knowledge/       # RAG pipeline (chunking, ingestion, vector search)
│   ├── onboarding/      # Core business logic (plans, tasks, progress)
│   ├── slack/           # Slack bot (commands, buttons, file uploads)
│   └── dashboard/       # REST API for web dashboard
├── dashboard/           # React frontend (Vite)
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # SQL migrations (including pgvector)
└── sample-docs/         # Example company docs for testing RAG
```

## Database Schema

```
User ──────── OnboardingPlan ──── Task
                    │
                    └──── PlanRevision (replan snapshots)

Document ──── DocumentChunk (+ vector embedding)
```

## License

MIT
