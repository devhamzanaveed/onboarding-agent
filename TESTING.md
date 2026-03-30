# Testing Guide — AI Onboarding Agent

This guide walks you through testing every feature end-to-end.

## Prerequisites

Make sure both are running:
- **Terminal 1**: `npm run start:dev` (NestJS backend, port 3000)
- **Terminal 2**: `cd dashboard && npm run dev` (React dashboard, port 5173)

---

## Test 1: Knowledge Ingestion (RAG)

### Upload documents via Slack DM

1. Open **Onboarding Agent** in Slack → DMs
2. Drag and drop these files one by one from `sample-docs/`:

   - `engineering-onboarding.md`
   - `company-policies.md`
   - `product-overview.md`
   - `deployment-guide.md`
   - `team-structure.md`
   - `api-guidelines.md`

3. **Expected**: For each file, the bot responds:
   ```
   📄 Processing engineering-onboarding.md...
   ✅ engineering-onboarding.md ingested successfully!
   • 12 chunks created and embedded
   • This knowledge will now be used in onboarding plans and Q&A.
   ```

### Verify in database
```bash
psql -d onboarding_agent -c "SELECT filename, COUNT(c.id) as chunks FROM \"Document\" d JOIN \"DocumentChunk\" c ON c.\"documentId\" = d.id GROUP BY filename;"
```

---

## Test 2: RAG-Powered Onboarding Plan

### Generate a plan (with knowledge)

In any Slack channel:
```
/start-onboarding Software Engineer
```

**Expected**: The plan should reference Acme-specific things like:
- `acme-app` monorepo, `make setup`, `make dev`
- GitHub, AWS, Datadog, Linear, Figma accounts
- `#engineering`, `#infra-requests`, `#code-review` channels
- BambooHR, Okta SSO, 1Password
- Specific team leads (Sarah Chen, Marcus Rivera)

**What to look for**: Each task should have resource tags underneath:
```
📄 Engineering Onboarding Guide  •  💬 #infra-requests  •  ⌨️ `make setup`
```

### Try different roles
```
/start-onboarding Product Manager
/start-onboarding DevOps Engineer
/start-onboarding UX Designer
/start-onboarding Frontend Developer
/start-onboarding Backend Developer
```

Each role should get a different, relevant plan.

---

## Test 3: Task Completion

1. After generating a plan, click **"Done ✓"** on a task
2. **Expected**:
   - Message updates in-place
   - Task shows ✅ with ~~strikethrough~~ title
   - Button changes to "Undo"
3. Click **"Undo"** to uncomplete
4. **Expected**: Task goes back to ⬜ with "Done ✓" button

### Mark some tasks done, skip others (for replan testing later)

---

## Test 4: Progress Tracking

```
/progress
```

**Expected**:
```
📊 Onboarding Progress
officialhamxa — Software Engineer

████░░░░░░  40% complete (8/20 tasks)

Day 1: 3/3 ✅
Day 2: 2/3 ← current
Day 3: 0/3
Day 4: 0/3
Day 5: 0/3
Day 6: 0/3
Day 7: 0/3
```

---

## Test 5: /ask Q&A with Citations

### Questions that should work well (answers from your docs):

```
/ask How do I set up my local development environment?
```
**Expected**: Mentions `git clone`, `make setup`, `make dev`, `.env.example` → `.env.local`. Cites `engineering-onboarding.md`.

```
/ask How do I deploy to production?
```
**Expected**: Mentions GitHub Actions, manual approval, 2 approvers, `#deploys` channel. Cites `deployment-guide.md`.

```
/ask What is our PTO policy?
```
**Expected**: Mentions unlimited PTO, 15 days minimum, BambooHR, `#out-of-office`. Cites `company-policies.md`.

```
/ask Who should I contact for AWS access?
```
**Expected**: Mentions `#infra-requests`, Priya Sharma / platform team. Cites `team-structure.md` or `engineering-onboarding.md`.

```
/ask What tech stack do we use?
```
**Expected**: Mentions Next.js 14, Go, PostgreSQL, Redis, AWS ECS Fargate. Cites `engineering-onboarding.md` or `product-overview.md`.

```
/ask How do I create a database migration?
```
**Expected**: Mentions `golang-migrate`, `services/api/migrations/`, UP and DOWN migrations. Cites `deployment-guide.md` or `api-guidelines.md`.

```
/ask What are the core company values?
```
**Expected**: Lists the 4 values (Ship fast, Transparency, Own the outcome, Remote-first). Cites `company-policies.md`.

```
/ask Who is the frontend team lead?
```
**Expected**: Sarah Chen. Cites `team-structure.md`.

```
/ask What benefits does the company offer?
```
**Expected**: Medical/dental/vision, $2500 office stipend, $1500 learning budget, MacBook Pro. Cites `company-policies.md`.

```
/ask How do I roll back a production deployment?
```
**Expected**: `make rollback-prod`, post in `#incidents`. Cites `deployment-guide.md`.

### Questions with no knowledge (should fail gracefully):

```
/ask What is the WiFi password?
```
**Expected**: "I don't have enough company knowledge to answer that..."

---

## Test 6: Advance Days

```
/next-day
```

**Expected**: Shows Day 2 tasks with resources and Done buttons.

Keep running `/next-day` to progress through days.

---

## Test 7: Adaptive Re-planning

### Setup: Create a low-completion scenario
1. Run `/start-onboarding Software Engineer`
2. Do NOT complete any Day 1 tasks
3. Run `/next-day` (advance to Day 2)
4. Do NOT complete any Day 2 tasks
5. Run `/next-day` (advance to Day 3)

**Expected**: At the bottom of Day 3 tasks, you should see:
```
⚠️ You seem to be behind on some tasks. Want to adjust your remaining plan?
[🔄 Replan]
```

6. Click the **"Replan"** button (or type `/replan`)

**Expected**:
```
✅ Plan updated! 12 new tasks generated for days 4–7.
```
Followed by new Day 4 tasks that account for your skipped work.

### Manual replan with reason
```
/replan switching to a different project focus
```

---

## Test 8: Web Dashboard

Open `http://localhost:5173` in your browser.

### Overview Page
**Expected**:
- Stats cards: Total Employees, Active, Completed, Avg Progress, Knowledge Docs
- Employee table with names, roles, day progress, completion bars
- Click an employee name to see their detail

### Employee Detail Page
**Expected**:
- Name, role, current day indicator
- Progress bar with percentage
- Day-by-day timeline cards:
  - Green border = all tasks completed
  - Purple border = current day
  - Each task shows completion status, description, resource tags
- Replan count badge (if replanned)

### API Endpoints (test in browser or curl)
```bash
# List all employees
curl http://localhost:3000/api/employees

# Get aggregate stats
curl http://localhost:3000/api/stats

# Get employee detail
curl http://localhost:3000/api/employees/YOUR_SLACK_USER_ID

# List knowledge documents
curl http://localhost:3000/api/documents
```

---

## Test 9: Multiple Users

If you have another Slack user in your workspace:
1. Have them run `/start-onboarding Product Manager`
2. Check the dashboard — both users should appear
3. Each should have different plans based on their role

---

## Test 10: Re-upload Documents

1. Upload a modified version of a document
2. Run `/start-onboarding Software Engineer` again
3. **Expected**: The new plan should reflect the updated content

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Bot doesn't respond to file upload | Check `file_shared` event is subscribed, `files:read` + `im:read` scopes added |
| "missing_scope" error | Add the scope mentioned in the error, reinstall app |
| Buttons don't update message | Make sure messages are posted via `chat.postMessage`, not `respond()` |
| Dashboard shows no data | Make sure NestJS is running on port 3000 |
| `/ask` returns generic answer | Upload more docs first — the RAG needs knowledge to work |
