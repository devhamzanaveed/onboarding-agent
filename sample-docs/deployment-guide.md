# Deployment Guide — Acme Inc.

## Environments

| Environment | URL | Branch | Auto-deploy |
|-------------|-----|--------|-------------|
| Local | localhost:3000 | any | — |
| Staging | staging.acme-app.com | main | Yes (on merge) |
| Production | app.acme-app.com | main | Manual approval |

## How to Deploy

### Staging (Automatic)
1. Merge your PR to `main`
2. GitHub Actions pipeline triggers automatically
3. Runs: lint → test → build → deploy to AWS ECS Fargate
4. Takes ~5 minutes
5. Monitor in `#deploys` Slack channel

### Production
1. After staging is verified, go to GitHub Actions
2. Find the latest successful staging deploy
3. Click "Deploy to Production" (manual approval required)
4. Two approvers needed: your tech lead + one from `@platform-team`
5. Post in `#deploys`: "Deploying v1.x.x to production — [brief description]"

## Rolling Back

If something goes wrong in production:

1. **Immediate**: Run `make rollback-prod` from the `acme-infra` repo
2. **Post in `#incidents`**: "@here Rolling back production — [reason]"
3. The rollback restores the previous ECS task definition (takes ~2 min)

## CI/CD Pipeline

Our GitHub Actions pipeline (`.github/workflows/deploy.yml`):

```
PR opened → lint + test + type-check
PR merged to main → build Docker image → push to ECR → deploy to staging
Manual trigger → deploy to production (requires 2 approvals)
```

### Required Checks
- `lint` — ESLint passes
- `test` — All unit + integration tests pass
- `type-check` — TypeScript strict mode
- `build` — Docker image builds successfully

## Database Migrations

### Running Migrations
```bash
# Locally
make migrate-up

# Staging (auto-runs on deploy)
# Production (run manually before deploying code)
make migrate-prod
```

### Creating Migrations
```bash
cd services/api
golang-migrate create -ext sql -dir migrations -seq add_new_table
```

### Migration Rules
- Always write both UP and DOWN migrations
- Test migrations on a copy of production data first
- Never drop columns directly — deprecate first, remove in the next release
- Coordinate with `@platform-team` for large migrations

## Monitoring

### Datadog Dashboards
- **API Latency**: datadog.acme-app.com/api-latency
- **Error Rate**: datadog.acme-app.com/error-rate
- **Database**: datadog.acme-app.com/db-performance

### PagerDuty
- On-call rotation in PagerDuty (weekly rotation)
- Alerts trigger for: p99 latency > 500ms, error rate > 1%, DB connections > 80%
- Escalation: on-call → tech lead → VP Engineering

### Logs
```bash
# View staging logs
make logs-staging

# View production logs (requires VPN)
make logs-prod
```

## Infrastructure

### AWS Services
- **ECS Fargate**: Runs API and web containers (auto-scaling 2-10 instances)
- **RDS**: PostgreSQL 15, Multi-AZ, automated backups
- **ElastiCache**: Redis 7, used for sessions and caching
- **S3**: File uploads, static assets
- **CloudFront**: CDN for frontend assets
- **Route 53**: DNS management

### Terraform
Infrastructure as code lives in `acme-infra` repo. Changes require PR review from `@platform-team`.

```bash
# Preview changes
cd acme-infra && terraform plan

# Apply (requires platform-team approval)
terraform apply
```
