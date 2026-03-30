# API Development Guidelines — Acme Inc.

## API Architecture

Our API is built with Go using the Chi router. It follows REST conventions with some pragmatic deviations.

### Base URL
- Local: `http://localhost:8080/api/v1`
- Staging: `https://staging.acme-app.com/api/v1`
- Production: `https://app.acme-app.com/api/v1`

## Request/Response Format

### All responses follow this structure:
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150
  }
}
```

### Error responses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required",
    "details": [
      { "field": "title", "message": "cannot be blank" }
    ]
  }
}
```

## Authentication

- All API requests require a Bearer token in the `Authorization` header
- Tokens are JWTs issued by the auth service (`services/auth`)
- Token expiry: 1 hour (refresh tokens: 30 days)
- SSO via Okta for enterprise customers

```bash
# Example authenticated request
curl -H "Authorization: Bearer eyJhbG..." https://app.acme-app.com/api/v1/projects
```

## Key Endpoints

### Projects
```
GET    /api/v1/projects           — List projects
POST   /api/v1/projects           — Create project
GET    /api/v1/projects/:id       — Get project
PATCH  /api/v1/projects/:id       — Update project
DELETE /api/v1/projects/:id       — Delete project
```

### Tasks
```
GET    /api/v1/projects/:id/tasks        — List tasks
POST   /api/v1/projects/:id/tasks        — Create task
PATCH  /api/v1/tasks/:id                 — Update task
DELETE /api/v1/tasks/:id                 — Delete task
POST   /api/v1/tasks/:id/assign          — Assign task
POST   /api/v1/tasks/:id/transition      — Move task status
```

### Users
```
GET    /api/v1/users                     — List team members
GET    /api/v1/users/me                  — Current user profile
PATCH  /api/v1/users/me                  — Update profile
```

## Code Standards

### File Structure
```
services/api/
├── cmd/server/main.go       # Entry point
├── internal/
│   ├── handler/             # HTTP handlers (thin, delegate to service)
│   ├── service/             # Business logic
│   ├── repository/          # Database queries
│   ├── model/               # Domain models
│   ├── middleware/           # Auth, logging, rate limiting
│   └── dto/                 # Request/response types
├── migrations/              # SQL migrations
├── pkg/                     # Shared utilities
└── tests/                   # Integration tests
```

### Naming Conventions
- Handlers: `HandleCreateProject`, `HandleListTasks`
- Services: `ProjectService.Create`, `TaskService.List`
- Repositories: `ProjectRepo.FindByID`, `TaskRepo.FindAll`
- Files: `project_handler.go`, `task_service.go`

### Error Handling
```go
// Always wrap errors with context
if err != nil {
    return fmt.Errorf("failed to create project: %w", err)
}

// Use custom error types for business logic errors
if project == nil {
    return apperror.NotFound("project", id)
}
```

### Testing
- Unit tests: `_test.go` files next to source
- Integration tests: `tests/` directory, require running database
- Run tests: `make test` (unit) or `make test-integration`
- Coverage target: 80% for services, 60% for handlers

## Database Conventions

### Table naming: `snake_case`, plural
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes
- Always add indexes for foreign keys
- Add composite indexes for common query patterns
- Use `EXPLAIN ANALYZE` before and after adding indexes

### Query Performance
- Use `sqlc` for type-safe SQL queries
- No ORM — write SQL directly
- Connection pooling via PgBouncer (max 100 connections in prod)
- Slow query threshold: 100ms (logged in Datadog)
