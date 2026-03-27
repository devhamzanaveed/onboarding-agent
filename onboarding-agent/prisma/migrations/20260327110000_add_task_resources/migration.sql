-- Add resources JSON column to Task
ALTER TABLE "Task" ADD COLUMN "resources" JSONB NOT NULL DEFAULT '[]';
