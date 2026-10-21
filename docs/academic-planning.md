# Academic planning in chat

Attach a DPA to either chat view. The planning card supports:

1. Reviewing completed/exempted and excluded entries. Corrections require a reason and invalidate the previous confirmation and draft. N remains failed; EXM counts with recorded earned credits. Original uploaded content is unchanged.
2. Selecting the actual course/major/intake and applicable planner, explicitly confirming them, and choosing year, semester and workload. All planner pools are available; overlap ranking is not used to determine the student's programme.
3. Generating a deterministic provisional semester draft with rule checks, blocked/review reasons, workload limits and category counts.

Planning uses exact earned unit codes and sufficient credit, published unit records, recurring semester offerings, template category counts and requisite relationships. Previously earned units alone satisfy prerequisites. Conservative handling holds unknown rules, mixed logic and combined requisite types for review. Concurrent co-requisite bundles are not automatically planned. Missing requisite records do not prove unrestricted enrolment. A selected draft is a bounded candidate set, not an optimal or approved enrolment schedule.

Known data gaps remain visible: no formal mapping from StudyPlanner pools to CourseIntake, no year-specific offering confirmation, and no verified institutional credit caps or timetable conflicts. The student's workload cap is not labelled as university policy.

Official source integration and advisor-review exports are deferred at the user's request. No student document or conversation is saved by this feature.

Run `node scripts/test-academic-planning.cjs`, the existing chat and double-major regression checks, and `npm run build` to verify changes.
