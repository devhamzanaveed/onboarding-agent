# Engineering Onboarding Guide — Acme Inc.

## Welcome to the Engineering Team!

Welcome to Acme Inc! This guide will help you get up and running quickly.

## Day 1: Environment Setup

### Accounts You'll Need
- **GitHub**: Request access to the `acme-inc` org from your manager. Our main repos are `acme-app` (monorepo), `acme-infra` (Terraform), and `acme-docs` (internal wiki).
- **AWS**: Request IAM credentials via the #infra-requests Slack channel. You'll get dev-only access initially.
- **Datadog**: Monitoring and logging. Ask #platform-team for an invite.
- **Linear**: We use Linear for project management. Join your team's project board.
- **Figma**: Design specs live here. Request viewer access from #design.

### Local Dev Setup
1. Clone the monorepo: `git clone git@github.com:acme-inc/acme-app.git`
2. Install dependencies: `make setup` (requires Docker, Node 20+, and Go 1.22+)
3. Copy `.env.example` to `.env.local` and fill in your dev credentials
4. Run the full stack locally: `make dev`
5. Frontend runs on `localhost:3000`, API on `localhost:8080`, admin on `localhost:3001`

### Development Workflow
- We use **trunk-based development** — branch off `main`, PR with at least 1 approval
- CI runs on every PR: lint, unit tests, integration tests, type-check
- PRs must pass all checks before merge. Use `Squash and Merge`.
- Deploy happens automatically on merge to `main` via GitHub Actions → staging → production (with manual approval for prod)

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **API**: Go (Chi router), PostgreSQL, Redis
- **Infrastructure**: AWS ECS Fargate, RDS, ElastiCache, S3, CloudFront
- **CI/CD**: GitHub Actions
- **Monitoring**: Datadog (APM, logs, metrics), PagerDuty for alerts

### Key Services
| Service | Repo Path | Port | Description |
|---------|-----------|------|-------------|
| Web App | `apps/web` | 3000 | Customer-facing Next.js app |
| Admin Panel | `apps/admin` | 3001 | Internal admin dashboard |
| API | `services/api` | 8080 | Main REST API (Go) |
| Worker | `services/worker` | - | Background job processor |
| Auth | `services/auth` | 8081 | Authentication service (OAuth2, SSO) |

### Database
- PostgreSQL 15 on AWS RDS
- Migrations managed with `golang-migrate`. Run `make migrate-up` locally.
- Schema lives in `services/api/migrations/`
- We use connection pooling via PgBouncer in production

## Code Standards

### Go
- Follow the official Go style guide
- Use `golangci-lint` (config in `.golangci.yml`)
- Table-driven tests are preferred
- Always handle errors explicitly — no `_` for error returns

### TypeScript
- Strict mode enabled
- Use functional components with hooks (no class components)
- Styling via Tailwind — no CSS modules or styled-components
- API calls go through `lib/api/` client, not raw fetch

## Communication

### Slack Channels
- `#engineering` — General engineering discussion
- `#deploys` — Deployment notifications and approvals
- `#incidents` — Active incident coordination
- `#code-review` — PR review requests
- `#infra-requests` — AWS access, new services, infrastructure changes
- `#platform-team` — Platform/DevOps team
- `#design` — Design discussion and specs

### Meetings
- **Daily standup**: 10:00 AM (15 min, async-first on Mondays)
- **Sprint planning**: Every other Monday, 2:00 PM
- **Tech sync**: Thursdays, 3:00 PM — architecture decisions, RFCs
- **1:1 with manager**: Weekly, scheduled individually

## Getting Help
- Stuck on setup? Ask in `#engineering` or DM your onboarding buddy
- Found a bug? File it in Linear under your team's project
- Need a code review? Post in `#code-review` with a link to the PR
- Security concern? Email security@acme-inc.com or DM the security team lead
