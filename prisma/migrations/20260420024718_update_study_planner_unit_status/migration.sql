-- CreateTable
CREATE TABLE "StudyPlanner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlannerUnit" (
    "id" SERIAL NOT NULL,
    "studyPlannerId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'selected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlannerUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlannerUnit_studyPlannerId_unitId_key" ON "StudyPlannerUnit"("studyPlannerId", "unitId");

-- AddForeignKey
ALTER TABLE "StudyPlannerUnit" ADD CONSTRAINT "StudyPlannerUnit_studyPlannerId_fkey" FOREIGN KEY ("studyPlannerId") REFERENCES "StudyPlanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlannerUnit" ADD CONSTRAINT "StudyPlannerUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;
