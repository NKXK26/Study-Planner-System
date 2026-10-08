# Hadif integration — 8 October 2026

Source: `origin/hadif`, commit `8ca6c965b5c1900f099f5fc1aba164ea20e99cff`.

The branch has no common ancestor with main. A selective merge records Hadif as a merge parent while retaining main's application, authentication, database and chatbot. This is not a wholesale import of the older branch. Recovery branch: `backup/main-before-hadif-20261008`, commit `a7e0d69`.

## Imported and adapted

- Unit Suggestions `/view/compare_study_planner` uses Hadif's comparison page and recommendation component, imported as `HadifUnitRecommendations.jsx` to avoid ambiguous `.js`/`.jsx` imports.
- DPA PDF/XLSX uploads remain available alongside student-ID searches. The shared DPA parser applies N/Failed exclusion, earned EXM credit and duplicate-attempt rules.
- Matching uses unit codes across database versions, with stable newest-first ties, consistent with the chatbot. Export and planner inspection remain available.
- Suggestions fetch recorded unit properties from `/api/unit`. The existing semester engine enforces offerings, prerequisite grouping, category counts, credit limits, four-unit limits and Project A before B. Hadif's scores order only units allowed by those checks.
- Missing API/rule data shows an error rather than unchecked recommendations. Request version guards prevent older searches/uploads from replacing newer results.

## Graduation and double major

Hadif does **not** contain a separate Graduation Eligibility page or API. Its unmatched-pool counts are not graduation checks: elective pools include alternatives. Main's category-based eligibility engine is therefore retained.

`/view/graduation-eligibility` now has one DPA upload and two views: **Graduation eligibility** and **Double major pathway**. Switching views retains the DPA and calculated results. Replacing or clearing the upload resets both results. `/view/double-major-checker` redirects to the double-major view. Dashboard uses one combined entry; the chatbot APIs remain compatible.

## Verification

- Graduation eligibility, double-major pathway and mixed requisite regression scripts.
- Production build.
- Browser checks: shared upload, both results, replacement/clear behavior, old-route redirect and imported suggestions.

No database schema/data or remote branches are modified. The merge is local until pushed explicitly.
