create sequence "public"."CourseIntake_ID_seq";

create sequence "public"."Course_ID_seq";

create sequence "public"."Major_ID_seq";

create sequence "public"."MasterStudyPlanner_ID_seq";

create sequence "public"."SemesterInStudyPlannerYear_ID_seq";

create sequence "public"."StudentStudyPlannerAmmendments_ID_seq";

create sequence "public"."Term_ID_seq";

create sequence "public"."UnitHistory_ID_seq";

create sequence "public"."UnitInSemesterStudyPlanner_ID_seq";

create sequence "public"."UnitRequisiteRelationship_ID_seq";

create sequence "public"."UnitTermOffered_ID_seq";

create sequence "public"."UnitType_ID_seq";

create sequence "public"."UserGroupAccess_ID_seq";

create sequence "public"."User_ID_seq";

create table "public"."Course" (
    "ID" smallint not null default nextval('"Course_ID_seq"'::regclass),
    "Code" character varying not null,
    "Name" character varying,
    "CreditsRequired" double precision,
    "Status" character varying
);


create table "public"."CourseIntake" (
    "ID" smallint not null default nextval('"CourseIntake_ID_seq"'::regclass),
    "Status" character varying,
    "TermID" smallint,
    "MajorID" smallint
);


create table "public"."Major" (
    "ID" smallint not null default nextval('"Major_ID_seq"'::regclass),
    "CourseID" smallint not null,
    "CourseCode" character varying not null,
    "Name" character varying,
    "Status" character varying
);


create table "public"."MasterStudyPlanner" (
    "ID" smallint not null default nextval('"MasterStudyPlanner_ID_seq"'::regclass),
    "CourseIntakeID" smallint not null,
    "Status" character varying not null
);


create table "public"."SemesterInStudyPlannerYear" (
    "ID" smallint not null default nextval('"SemesterInStudyPlannerYear_ID_seq"'::regclass),
    "MasterStudyPlannerID" smallint not null,
    "Year" smallint not null,
    "SemType" character varying not null
);


create table "public"."Student" (
    "StudentID" numeric not null,
    "IntakeID" smallint not null,
    "FirstName" character varying,
    "Status" character varying,
    "CourseID" smallint not null,
    "MajorID" smallint not null,
    "CreditCompleted" double precision
);


create table "public"."StudentStudyPlannerAmmendments" (
    "ID" smallint not null default nextval('"StudentStudyPlannerAmmendments_ID_seq"'::regclass),
    "StudentID" numeric not null,
    "UnitCode" character varying,
    "NewUnitCode" character varying,
    "Action" character varying not null,
    "TimeofAction" timestamp(6) without time zone default (now() AT TIME ZONE 'utc'::text),
    "NewUnitTypeID" smallint,
    "Year" smallint not null,
    "SemIndex" smallint not null
);


create table "public"."Term" (
    "ID" smallint not null default nextval('"Term_ID_seq"'::regclass),
    "Name" text not null,
    "Year" integer,
    "Month" smallint,
    "Status" character varying,
    "SemType" character varying not null
);


create table "public"."Unit" (
    "UnitCode" character varying not null,
    "Name" character varying not null,
    "CreditPoints" double precision,
    "Availability" character varying not null
);


create table "public"."UnitHistory" (
    "ID" smallint not null default nextval('"UnitHistory_ID_seq"'::regclass),
    "StudentID" numeric not null,
    "UnitCode" character varying,
    "Status" character varying,
    "TermID" smallint,
    "Year" smallint not null
);


create table "public"."UnitInSemesterStudyPlanner" (
    "ID" smallint not null default nextval('"UnitInSemesterStudyPlanner_ID_seq"'::regclass),
    "UnitTypeID" smallint,
    "UnitCode" character varying,
    "SemesterInStudyPlannerYearID" smallint not null
);


create table "public"."UnitRequisiteRelationship" (
    "ID" smallint not null default nextval('"UnitRequisiteRelationship_ID_seq"'::regclass),
    "UnitCode" character varying not null,
    "RequisiteUnitCode" character varying,
    "UnitRelationship" character varying not null,
    "LogicalOperators" character varying,
    "MinCP" real
);


create table "public"."UnitTermOffered" (
    "UnitCode" character varying not null,
    "ID" smallint not null default nextval('"UnitTermOffered_ID_seq"'::regclass),
    "TermType" character varying not null
);


create table "public"."UnitType" (
    "ID" smallint not null default nextval('"UnitType_ID_seq"'::regclass),
    "Name" character varying not null,
    "Colour" character varying
);


create table "public"."User" (
    "ID" smallint not null default nextval('"User_ID_seq"'::regclass),
    "FirstName" character varying,
    "LastName" character varying,
    "Email" character varying not null,
    "UserGroupAccessID" smallint not null,
    "Password" character varying,
    "Type" character varying,
    "Status" character varying,
    "UpdatedAt" timestamp(6) without time zone
);


create table "public"."UserGroupAccess" (
    "ID" smallint not null default nextval('"UserGroupAccess_ID_seq"'::regclass),
    "Name" character varying,
    "Access" character varying,
    "Module" character varying not null
);


alter sequence "public"."CourseIntake_ID_seq" owned by "public"."CourseIntake"."ID";

alter sequence "public"."Course_ID_seq" owned by "public"."Course"."ID";

alter sequence "public"."Major_ID_seq" owned by "public"."Major"."ID";

alter sequence "public"."MasterStudyPlanner_ID_seq" owned by "public"."MasterStudyPlanner"."ID";

alter sequence "public"."SemesterInStudyPlannerYear_ID_seq" owned by "public"."SemesterInStudyPlannerYear"."ID";

alter sequence "public"."StudentStudyPlannerAmmendments_ID_seq" owned by "public"."StudentStudyPlannerAmmendments"."ID";

alter sequence "public"."Term_ID_seq" owned by "public"."Term"."ID";

alter sequence "public"."UnitHistory_ID_seq" owned by "public"."UnitHistory"."ID";

alter sequence "public"."UnitInSemesterStudyPlanner_ID_seq" owned by "public"."UnitInSemesterStudyPlanner"."ID";

alter sequence "public"."UnitRequisiteRelationship_ID_seq" owned by "public"."UnitRequisiteRelationship"."ID";

alter sequence "public"."UnitTermOffered_ID_seq" owned by "public"."UnitTermOffered"."ID";

alter sequence "public"."UnitType_ID_seq" owned by "public"."UnitType"."ID";

alter sequence "public"."UserGroupAccess_ID_seq" owned by "public"."UserGroupAccess"."ID";

alter sequence "public"."User_ID_seq" owned by "public"."User"."ID";

CREATE UNIQUE INDEX "CourseIntake_ID_key" ON public."CourseIntake" USING btree ("ID");

CREATE UNIQUE INDEX "CourseIntake_pkey" ON public."CourseIntake" USING btree ("ID");

CREATE UNIQUE INDEX "CourseTermStudyPlanner_ID_key" ON public."UnitInSemesterStudyPlanner" USING btree ("ID");

CREATE UNIQUE INDEX "CourseTermStudyPlanner_pkey" ON public."UnitInSemesterStudyPlanner" USING btree ("ID");

CREATE UNIQUE INDEX "Course_Code_key" ON public."Course" USING btree ("Code");

CREATE UNIQUE INDEX "Course_ID_Code_key" ON public."Course" USING btree ("ID", "Code");

CREATE UNIQUE INDEX "Course_pkey" ON public."Course" USING btree ("ID");

CREATE UNIQUE INDEX "Major_ID_key" ON public."Major" USING btree ("ID");

CREATE UNIQUE INDEX "Major_pkey" ON public."Major" USING btree ("ID", "CourseID", "CourseCode");

CREATE UNIQUE INDEX "MasterStudyPlanner_ID_key" ON public."MasterStudyPlanner" USING btree ("ID");

CREATE UNIQUE INDEX "MasterStudyPlanner_pkey" ON public."MasterStudyPlanner" USING btree ("ID");

CREATE UNIQUE INDEX "SemesterInStudyPlannerYear_ID_key" ON public."SemesterInStudyPlannerYear" USING btree ("ID");

CREATE UNIQUE INDEX "SemesterInStudyPlannerYear_pkey" ON public."SemesterInStudyPlannerYear" USING btree ("ID");

CREATE UNIQUE INDEX "StudentStudyPlannerAmmendments_pkey" ON public."StudentStudyPlannerAmmendments" USING btree ("ID");

CREATE UNIQUE INDEX "Student_StudentID_key" ON public."Student" USING btree ("StudentID");

CREATE UNIQUE INDEX "Student_pkey" ON public."Student" USING btree ("StudentID");

CREATE UNIQUE INDEX "Term_pkey" ON public."Term" USING btree ("ID");

CREATE UNIQUE INDEX "UnitHistory_pkey" ON public."UnitHistory" USING btree ("ID");

CREATE UNIQUE INDEX "UnitRequisiteRelationship_pkey" ON public."UnitRequisiteRelationship" USING btree ("ID");

CREATE UNIQUE INDEX "UnitTermOffered_ID_key" ON public."UnitTermOffered" USING btree ("ID");

CREATE UNIQUE INDEX "UnitTermOffered_pkey" ON public."UnitTermOffered" USING btree ("ID");

CREATE UNIQUE INDEX "UnitType_ID_key" ON public."UnitType" USING btree ("ID");

CREATE UNIQUE INDEX "UnitType_pkey" ON public."UnitType" USING btree ("ID", "Name");

CREATE UNIQUE INDEX "Unit_pkey" ON public."Unit" USING btree ("UnitCode");

CREATE UNIQUE INDEX "UserGroupAccess_ID_key" ON public."UserGroupAccess" USING btree ("ID");

CREATE UNIQUE INDEX "UserGroupAccess_pkey" ON public."UserGroupAccess" USING btree ("ID", "Module");

CREATE UNIQUE INDEX "User_pkey" ON public."User" USING btree ("ID", "Email", "UserGroupAccessID");

alter table "public"."Course" add constraint "Course_pkey" PRIMARY KEY using index "Course_pkey";

alter table "public"."CourseIntake" add constraint "CourseIntake_pkey" PRIMARY KEY using index "CourseIntake_pkey";

alter table "public"."Major" add constraint "Major_pkey" PRIMARY KEY using index "Major_pkey";

alter table "public"."MasterStudyPlanner" add constraint "MasterStudyPlanner_pkey" PRIMARY KEY using index "MasterStudyPlanner_pkey";

alter table "public"."SemesterInStudyPlannerYear" add constraint "SemesterInStudyPlannerYear_pkey" PRIMARY KEY using index "SemesterInStudyPlannerYear_pkey";

alter table "public"."Student" add constraint "Student_pkey" PRIMARY KEY using index "Student_pkey";

alter table "public"."StudentStudyPlannerAmmendments" add constraint "StudentStudyPlannerAmmendments_pkey" PRIMARY KEY using index "StudentStudyPlannerAmmendments_pkey";

alter table "public"."Term" add constraint "Term_pkey" PRIMARY KEY using index "Term_pkey";

alter table "public"."Unit" add constraint "Unit_pkey" PRIMARY KEY using index "Unit_pkey";

alter table "public"."UnitHistory" add constraint "UnitHistory_pkey" PRIMARY KEY using index "UnitHistory_pkey";

alter table "public"."UnitInSemesterStudyPlanner" add constraint "CourseTermStudyPlanner_pkey" PRIMARY KEY using index "CourseTermStudyPlanner_pkey";

alter table "public"."UnitRequisiteRelationship" add constraint "UnitRequisiteRelationship_pkey" PRIMARY KEY using index "UnitRequisiteRelationship_pkey";

alter table "public"."UnitTermOffered" add constraint "UnitTermOffered_pkey" PRIMARY KEY using index "UnitTermOffered_pkey";

alter table "public"."UnitType" add constraint "UnitType_pkey" PRIMARY KEY using index "UnitType_pkey";

alter table "public"."User" add constraint "User_pkey" PRIMARY KEY using index "User_pkey";

alter table "public"."UserGroupAccess" add constraint "UserGroupAccess_pkey" PRIMARY KEY using index "UserGroupAccess_pkey";

alter table "public"."CourseIntake" add constraint "CourseIntake_MajorID_fkey" FOREIGN KEY ("MajorID") REFERENCES "Major"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."CourseIntake" validate constraint "CourseIntake_MajorID_fkey";

alter table "public"."CourseIntake" add constraint "CourseIntake_TermID_fkey" FOREIGN KEY ("TermID") REFERENCES "Term"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."CourseIntake" validate constraint "CourseIntake_TermID_fkey";

alter table "public"."Major" add constraint "Major_CourseID_CourseCode_fkey" FOREIGN KEY ("CourseID", "CourseCode") REFERENCES "Course"("ID", "Code") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."Major" validate constraint "Major_CourseID_CourseCode_fkey";

alter table "public"."MasterStudyPlanner" add constraint "MasterStudyPlanner_CourseIntakeID_fkey" FOREIGN KEY ("CourseIntakeID") REFERENCES "CourseIntake"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."MasterStudyPlanner" validate constraint "MasterStudyPlanner_CourseIntakeID_fkey";

alter table "public"."SemesterInStudyPlannerYear" add constraint "SemesterInStudyPlannerYear_MasterStudyPlannerID_fkey" FOREIGN KEY ("MasterStudyPlannerID") REFERENCES "MasterStudyPlanner"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."SemesterInStudyPlannerYear" validate constraint "SemesterInStudyPlannerYear_MasterStudyPlannerID_fkey";

alter table "public"."Student" add constraint "Student_CourseID_fkey" FOREIGN KEY ("CourseID") REFERENCES "Course"("ID") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."Student" validate constraint "Student_CourseID_fkey";

alter table "public"."Student" add constraint "Student_IntakeID_fkey" FOREIGN KEY ("IntakeID") REFERENCES "CourseIntake"("ID") not valid;

alter table "public"."Student" validate constraint "Student_IntakeID_fkey";

alter table "public"."Student" add constraint "Student_MajorID_fkey" FOREIGN KEY ("MajorID") REFERENCES "Major"("ID") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."Student" validate constraint "Student_MajorID_fkey";

alter table "public"."StudentStudyPlannerAmmendments" add constraint "StudentStudyPlannerAmmendments_NewUnitCode_fkey" FOREIGN KEY ("NewUnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."StudentStudyPlannerAmmendments" validate constraint "StudentStudyPlannerAmmendments_NewUnitCode_fkey";

alter table "public"."StudentStudyPlannerAmmendments" add constraint "StudentStudyPlannerAmmendments_NewUnitTypeID_fkey" FOREIGN KEY ("NewUnitTypeID") REFERENCES "UnitType"("ID") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."StudentStudyPlannerAmmendments" validate constraint "StudentStudyPlannerAmmendments_NewUnitTypeID_fkey";

alter table "public"."StudentStudyPlannerAmmendments" add constraint "StudentStudyPlannerAmmendments_StudentID_fkey" FOREIGN KEY ("StudentID") REFERENCES "Student"("StudentID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."StudentStudyPlannerAmmendments" validate constraint "StudentStudyPlannerAmmendments_StudentID_fkey";

alter table "public"."StudentStudyPlannerAmmendments" add constraint "StudentStudyPlannerAmmendments_UnitCode_fkey" FOREIGN KEY ("UnitCode") REFERENCES "Unit"("UnitCode") not valid;

alter table "public"."StudentStudyPlannerAmmendments" validate constraint "StudentStudyPlannerAmmendments_UnitCode_fkey";

alter table "public"."UnitHistory" add constraint "UnitHistory_StudentID_fkey" FOREIGN KEY ("StudentID") REFERENCES "Student"("StudentID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitHistory" validate constraint "UnitHistory_StudentID_fkey";

alter table "public"."UnitHistory" add constraint "UnitHistory_TermID_fkey" FOREIGN KEY ("TermID") REFERENCES "Term"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitHistory" validate constraint "UnitHistory_TermID_fkey";

alter table "public"."UnitHistory" add constraint "UnitHistory_UnitCode_fkey" FOREIGN KEY ("UnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitHistory" validate constraint "UnitHistory_UnitCode_fkey";

alter table "public"."UnitInSemesterStudyPlanner" add constraint "CourseTermStudyPlanner_SemesterInStudyPlannerYearID_fkey" FOREIGN KEY ("SemesterInStudyPlannerYearID") REFERENCES "SemesterInStudyPlannerYear"("ID") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitInSemesterStudyPlanner" validate constraint "CourseTermStudyPlanner_SemesterInStudyPlannerYearID_fkey";

alter table "public"."UnitInSemesterStudyPlanner" add constraint "CourseTermStudyPlanner_UnitCode_fkey" FOREIGN KEY ("UnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitInSemesterStudyPlanner" validate constraint "CourseTermStudyPlanner_UnitCode_fkey";

alter table "public"."UnitInSemesterStudyPlanner" add constraint "CourseTermStudyPlanner_UnitTypeID_fkey" FOREIGN KEY ("UnitTypeID") REFERENCES "UnitType"("ID") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."UnitInSemesterStudyPlanner" validate constraint "CourseTermStudyPlanner_UnitTypeID_fkey";

alter table "public"."UnitRequisiteRelationship" add constraint "UnitRequisiteRelationship_RequisiteUnitCode_fkey" FOREIGN KEY ("RequisiteUnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitRequisiteRelationship" validate constraint "UnitRequisiteRelationship_RequisiteUnitCode_fkey";

alter table "public"."UnitRequisiteRelationship" add constraint "UnitRequisiteRelationship_UnitCode_fkey" FOREIGN KEY ("UnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitRequisiteRelationship" validate constraint "UnitRequisiteRelationship_UnitCode_fkey";

alter table "public"."UnitTermOffered" add constraint "UnitTermOffered_UnitCode_fkey" FOREIGN KEY ("UnitCode") REFERENCES "Unit"("UnitCode") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."UnitTermOffered" validate constraint "UnitTermOffered_UnitCode_fkey";

alter table "public"."User" add constraint "User_UserGroupAccessID_fkey" FOREIGN KEY ("UserGroupAccessID") REFERENCES "UserGroupAccess"("ID") ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."User" validate constraint "User_UserGroupAccessID_fkey";


