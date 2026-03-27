# Acme Inc. — Product Overview

## What We Build

Acme is a **project management platform** purpose-built for remote engineering teams. Think of it as Linear meets Notion, optimized for distributed teams.

## Key Features

### 1. Smart Sprint Planning
- AI-powered sprint capacity planning based on team velocity and availability
- Automatic task estimation using historical data
- Integration with GitHub — auto-link PRs and commits to tasks

### 2. Async Standups
- Replace daily standups with async status updates
- Threaded discussions on each update
- Weekly summaries generated automatically

### 3. Engineering Metrics Dashboard
- Cycle time, lead time, deployment frequency, MTTR
- DORA metrics tracking out of the box
- Custom dashboards per team

### 4. Knowledge Base (Wiki)
- Markdown-first documentation
- Version controlled (Git-backed)
- Full-text search across all docs
- Embedded code snippets with syntax highlighting

### 5. Integrations
- **GitHub**: PRs, commits, issues synced bidirectionally
- **Slack**: Notifications, standups, bot commands
- **Figma**: Embed designs directly in tasks
- **Datadog**: Link monitors and alerts to tasks
- **Google Calendar**: Automatic capacity adjustments for OOO

## Target Customers

### Ideal Customer Profile (ICP)
- B2B SaaS companies
- 20–200 engineers
- Remote or hybrid teams
- Using GitHub for code
- Currently using Jira, Asana, or Notion (and frustrated)

### Pricing Tiers
| Plan | Price | Users | Features |
|------|-------|-------|----------|
| Starter | $8/user/mo | Up to 20 | Core PM, GitHub integration |
| Team | $15/user/mo | Up to 100 | + Async standups, metrics |
| Enterprise | Custom | Unlimited | + SSO, audit logs, SLA, dedicated CSM |

## Product Architecture

### Frontend
- Next.js 14 with App Router
- Real-time updates via WebSocket (Pusher)
- Optimistic UI updates for snappy UX
- Markdown editor: TipTap-based with custom extensions

### Backend
- Go microservices behind an API gateway
- PostgreSQL for structured data
- Redis for caching and real-time pub/sub
- S3 for file storage (attachments, images)
- Background workers for async tasks (email, notifications, sync)

### Infrastructure
- AWS ECS Fargate (containerized, auto-scaling)
- CloudFront CDN for static assets
- RDS Multi-AZ for database high availability
- ElastiCache Redis cluster

## Competitors
| Competitor | Our Advantage |
|------------|---------------|
| Jira | Simpler UX, faster, built for remote teams |
| Linear | Better async features, stronger analytics |
| Asana | Engineering-focused, GitHub-native |
| Notion | Purpose-built PM vs. general-purpose wiki |

## Roadmap (Q2 2026)
- **AI Code Review Summaries**: Auto-summarize PR changes for reviewers
- **Team Health Scores**: Sentiment analysis from standups and retrospectives
- **Mobile App**: iOS and Android native apps
- **SOC 2 Type II Certification**: Enterprise compliance requirement

## Customer Success Metrics
- **Average onboarding time**: 2 days (from signup to first sprint)
- **NPS Score**: 72
- **Monthly churn**: < 2%
- **Active daily users**: 85% of licensed seats
