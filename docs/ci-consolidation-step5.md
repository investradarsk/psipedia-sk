# CI consolidation — step 5: shared dependency and quality validation

Four compatible Notion PR/offline build workflows merged into `.github/workflows/notion-quality-ci.yml`. Same Ubuntu runner family, exact Node 24.18.0, default merge-ref checkout, same npm install behavior, no deployment or production credentials. Their original scope lists retained (including old workflow paths for migration), plus new shared controls. The shared manifest retains every original command except repeated npm ci and redundant revision logging. Identical commands run once when any owning suite is selected; distinct TypeScript flags and distinct Node test contexts are not merged.

- 4 independent checkouts/Node setups/npm installs → 1 when all four would previously run.
- 3 full lint commands → 1, 4 builds → 1 within this group.
- 30 original command occurrences → 22 unique commands (excluding npm ci/revision logging).
- Shared npm download cache explicitly keyed by package-lock.json via setup-node; do not cache node_modules, secrets or databases.
- Existing scope guard now checks the combined Notion workflow. Selection contracts preserve suite ownership and command wiring. Manual execution now selects all four, including former PR-only suites; no production calls.
- Other workflows still install independently and central required CI still builds/lints separately. Cross-workflow build sharing is step 6; browser/D1 consolidation is step 7. No claim that project-wide quality consolidation is complete or that runtime savings are measured. Full CI not yet executed by this connector.

