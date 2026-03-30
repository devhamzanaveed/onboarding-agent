CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanRevision_planId_idx" ON "PlanRevision"("planId");

ALTER TABLE "PlanRevision" ADD CONSTRAINT "PlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
