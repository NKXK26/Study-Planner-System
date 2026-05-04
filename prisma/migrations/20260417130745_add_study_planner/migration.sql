-- CreateTable
CREATE TABLE "Course" (
    "ID" SMALLSERIAL NOT NULL,
    "Code" VARCHAR NOT NULL,
    "Name" VARCHAR,
    "CreditsRequired" DOUBLE PRECISION,
    "Status" VARCHAR,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "CourseIntake" (
    "ID" SMALLSERIAL NOT NULL,
    "Status" VARCHAR,
    "TermID" SMALLINT,
    "MajorID" SMALLINT,

    CONSTRAINT "CourseIntake_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "Major" (
    "ID" SMALLSERIAL NOT NULL,
    "CourseID" SMALLINT NOT NULL,
    "CourseCode" VARCHAR NOT NULL,
    "Name" VARCHAR,
    "Status" VARCHAR,

    CONSTRAINT "Major_pkey" PRIMARY KEY ("ID","CourseID","CourseCode")
);

-- CreateTable
CREATE TABLE "MasterStudyPlanner" (
    "ID" SMALLSERIAL NOT NULL,
    "CourseIntakeID" SMALLINT NOT NULL,
    "Status" VARCHAR NOT NULL,

    CONSTRAINT "MasterStudyPlanner_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "SemesterInStudyPlannerYear" (
    "ID" SMALLSERIAL NOT NULL,
    "MasterStudyPlannerID" SMALLINT NOT NULL,
    "Year" SMALLINT NOT NULL,
    "SemType" VARCHAR NOT NULL,

    CONSTRAINT "SemesterInStudyPlannerYear_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "Student" (
    "StudentID" DECIMAL NOT NULL,
    "IntakeID" SMALLINT NOT NULL,
    "FirstName" VARCHAR,
    "Status" VARCHAR,
    "CourseID" SMALLINT NOT NULL,
    "MajorID" SMALLINT NOT NULL,
    "CreditCompleted" DOUBLE PRECISION,
    "MPUCreditCompleted" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("StudentID")
);

-- CreateTable
CREATE TABLE "StudentStudyPlannerAmmendments" (
    "ID" SMALLSERIAL NOT NULL,
    "StudentID" DECIMAL NOT NULL,
    "Action" VARCHAR NOT NULL,
    "TimeofAction" TIMESTAMP(6) DEFAULT (now() AT TIME ZONE 'utc'::text),
    "NewUnitTypeID" SMALLINT,
    "Year" SMALLINT,
    "SemIndex" SMALLINT,
    "SemType" VARCHAR NOT NULL,
    "SemID" SMALLINT,
    "UnitID" SMALLINT,
    "NewUnitID" SMALLINT,
    "OldUnitTypeID" SMALLINT,

    CONSTRAINT "StudentStudyPlannerAmmendments_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "Term" (
    "ID" SMALLSERIAL NOT NULL,
    "Name" TEXT NOT NULL,
    "Year" INTEGER,
    "Month" SMALLINT,
    "Status" VARCHAR,
    "SemType" VARCHAR NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "Unit" (
    "UnitCode" VARCHAR NOT NULL,
    "Name" VARCHAR NOT NULL,
    "CreditPoints" DOUBLE PRECISION,
    "Availability" VARCHAR NOT NULL,
    "ID" SMALLSERIAL NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "UnitType" (
    "ID" SMALLSERIAL NOT NULL,
    "Name" VARCHAR NOT NULL,
    "Colour" VARCHAR,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("ID","Name")
);

-- CreateTable
CREATE TABLE "UnitHistory" (
    "ID" SMALLSERIAL NOT NULL,
    "StudentID" DECIMAL NOT NULL,
    "Status" VARCHAR,
    "TermID" SMALLINT,
    "Year" SMALLINT NOT NULL,
    "UnitID" SMALLINT,

    CONSTRAINT "UnitHistory_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "UnitInSemesterStudyPlanner" (
    "ID" SMALLSERIAL NOT NULL,
    "UnitTypeID" SMALLINT,
    "SemesterInStudyPlannerYearID" SMALLINT NOT NULL,
    "UnitID" SMALLINT,

    CONSTRAINT "CourseTermStudyPlanner_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "UnitTermOffered" (
    "ID" SMALLSERIAL NOT NULL,
    "TermType" VARCHAR NOT NULL,
    "UnitID" SMALLINT,

    CONSTRAINT "UnitTermOffered_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "ID" SMALLSERIAL NOT NULL,
    "UserID" SMALLINT NOT NULL,
    "UserEmail" VARCHAR NOT NULL,
    "UserGroupAccessID" SMALLINT NOT NULL,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "roles" (
    "ID" SMALLSERIAL NOT NULL,
    "Name" VARCHAR NOT NULL,
    "Description" VARCHAR,
    "Color" VARCHAR,
    "Priority" INTEGER NOT NULL DEFAULT 0,
    "IsSystem" BOOLEAN NOT NULL DEFAULT false,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "permissions" (
    "ID" SMALLSERIAL NOT NULL,
    "Name" VARCHAR NOT NULL,
    "Description" VARCHAR,
    "Resource" VARCHAR NOT NULL,
    "Action" VARCHAR NOT NULL,
    "Module" VARCHAR NOT NULL,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "ID" SMALLSERIAL NOT NULL,
    "UserProfileID" SMALLINT NOT NULL,
    "RoleID" SMALLINT NOT NULL,
    "AssignedBy" SMALLINT,
    "AssignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "ID" SMALLSERIAL NOT NULL,
    "RoleID" SMALLINT NOT NULL,
    "PermissionID" SMALLINT NOT NULL,
    "Granted" BOOLEAN NOT NULL DEFAULT true,
    "GrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "GrantedBy" SMALLINT,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "UnitRequisiteRelationship" (
    "ID" SMALLSERIAL NOT NULL,
    "UnitRelationship" VARCHAR NOT NULL,
    "LogicalOperators" VARCHAR,
    "MinCP" REAL,
    "UnitID" SMALLINT,
    "RequisiteUnitID" SMALLINT,

    CONSTRAINT "UnitRequisiteRelationship_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "user_group_access" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "access" VARCHAR,
    "module" VARCHAR NOT NULL,

    CONSTRAINT "user_group_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "ID" SMALLSERIAL NOT NULL,
    "FirstName" VARCHAR,
    "LastName" VARCHAR,
    "Email" VARCHAR NOT NULL,
    "UserGroupAccessID" SMALLINT NOT NULL,
    "Password" VARCHAR,
    "Type" VARCHAR,
    "Status" VARCHAR,
    "UpdatedAt" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "ID" SERIAL NOT NULL,
    "UserID" SMALLINT,
    "Action" VARCHAR NOT NULL,
    "Module" VARCHAR NOT NULL,
    "Details" TEXT,
    "IPAddress" VARCHAR,
    "UserAgent" TEXT,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("ID")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_Code_key" ON "Course"("Code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_ID_Code_key" ON "Course"("ID", "Code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseIntake_ID_key" ON "CourseIntake"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "Major_ID_key" ON "Major"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "MasterStudyPlanner_ID_key" ON "MasterStudyPlanner"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterInStudyPlannerYear_ID_key" ON "SemesterInStudyPlannerYear"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "Student_StudentID_key" ON "Student"("StudentID");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_ID_key" ON "Unit"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "UnitType_ID_key" ON "UnitType"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTermStudyPlanner_ID_key" ON "UnitInSemesterStudyPlanner"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "UnitTermOffered_ID_key" ON "UnitTermOffered"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_UserID_UserEmail_UserGroupAccessID_key" ON "user_profiles"("UserID", "UserEmail", "UserGroupAccessID");

-- CreateIndex
CREATE UNIQUE INDEX "roles_Name_key" ON "roles"("Name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_Name_key" ON "permissions"("Name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_UserProfileID_RoleID_key" ON "user_roles"("UserProfileID", "RoleID");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_RoleID_PermissionID_key" ON "role_permissions"("RoleID", "PermissionID");

-- CreateIndex
CREATE UNIQUE INDEX "users_Email_key" ON "users"("Email");

-- AddForeignKey
ALTER TABLE "CourseIntake" ADD CONSTRAINT "CourseIntake_MajorID_fkey" FOREIGN KEY ("MajorID") REFERENCES "Major"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseIntake" ADD CONSTRAINT "CourseIntake_TermID_fkey" FOREIGN KEY ("TermID") REFERENCES "Term"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Major" ADD CONSTRAINT "Major_CourseID_CourseCode_fkey" FOREIGN KEY ("CourseID", "CourseCode") REFERENCES "Course"("ID", "Code") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterStudyPlanner" ADD CONSTRAINT "MasterStudyPlanner_CourseIntakeID_fkey" FOREIGN KEY ("CourseIntakeID") REFERENCES "CourseIntake"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemesterInStudyPlannerYear" ADD CONSTRAINT "SemesterInStudyPlannerYear_MasterStudyPlannerID_fkey" FOREIGN KEY ("MasterStudyPlannerID") REFERENCES "MasterStudyPlanner"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_CourseID_fkey" FOREIGN KEY ("CourseID") REFERENCES "Course"("ID") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_IntakeID_fkey" FOREIGN KEY ("IntakeID") REFERENCES "CourseIntake"("ID") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_MajorID_fkey" FOREIGN KEY ("MajorID") REFERENCES "Major"("ID") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_NewUnitID_fkey" FOREIGN KEY ("NewUnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_NewUnitTypeID_fkey" FOREIGN KEY ("NewUnitTypeID") REFERENCES "UnitType"("ID") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_OldUnitTypeID_fkey" FOREIGN KEY ("OldUnitTypeID") REFERENCES "UnitType"("ID") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_SemID_fkey" FOREIGN KEY ("SemID") REFERENCES "SemesterInStudyPlannerYear"("ID") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_StudentID_fkey" FOREIGN KEY ("StudentID") REFERENCES "Student"("StudentID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStudyPlannerAmmendments" ADD CONSTRAINT "StudentStudyPlannerAmmendments_UnitID_fkey" FOREIGN KEY ("UnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHistory" ADD CONSTRAINT "UnitHistory_StudentID_fkey" FOREIGN KEY ("StudentID") REFERENCES "Student"("StudentID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHistory" ADD CONSTRAINT "UnitHistory_TermID_fkey" FOREIGN KEY ("TermID") REFERENCES "Term"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHistory" ADD CONSTRAINT "UnitHistory_UnitID_fkey" FOREIGN KEY ("UnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitInSemesterStudyPlanner" ADD CONSTRAINT "CourseTermStudyPlanner_SemesterInStudyPlannerYearID_fkey" FOREIGN KEY ("SemesterInStudyPlannerYearID") REFERENCES "SemesterInStudyPlannerYear"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitInSemesterStudyPlanner" ADD CONSTRAINT "CourseTermStudyPlanner_UnitTypeID_fkey" FOREIGN KEY ("UnitTypeID") REFERENCES "UnitType"("ID") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitInSemesterStudyPlanner" ADD CONSTRAINT "UnitInSemesterStudyPlanner_UnitID_fkey" FOREIGN KEY ("UnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitTermOffered" ADD CONSTRAINT "UnitTermOffered_UnitID_fkey" FOREIGN KEY ("UnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "users"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_AssignedBy_fkey" FOREIGN KEY ("AssignedBy") REFERENCES "user_profiles"("ID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_RoleID_fkey" FOREIGN KEY ("RoleID") REFERENCES "roles"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_UserProfileID_fkey" FOREIGN KEY ("UserProfileID") REFERENCES "user_profiles"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_GrantedBy_fkey" FOREIGN KEY ("GrantedBy") REFERENCES "user_profiles"("ID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_PermissionID_fkey" FOREIGN KEY ("PermissionID") REFERENCES "permissions"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_RoleID_fkey" FOREIGN KEY ("RoleID") REFERENCES "roles"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitRequisiteRelationship" ADD CONSTRAINT "UnitRequisiteRelationship_RequisiteUnitID_fkey" FOREIGN KEY ("RequisiteUnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitRequisiteRelationship" ADD CONSTRAINT "UnitRequisiteRelationship_UnitID_fkey" FOREIGN KEY ("UnitID") REFERENCES "Unit"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_UserGroupAccessID_fkey" FOREIGN KEY ("UserGroupAccessID") REFERENCES "user_group_access"("id") ON DELETE SET DEFAULT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "users"("ID") ON DELETE SET NULL ON UPDATE CASCADE;
