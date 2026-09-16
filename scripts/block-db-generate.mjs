const documentationPath = "docs/MIGRATION-SAFETY-SK.md";

console.error(
  [
    "ERROR: npm run db:generate is intentionally blocked by MIG-0.",
    "The repository has a known hybrid migration state: SQL migrations extend beyond the Drizzle journal/snapshots.",
    "Running drizzle-kit generate could advance or rewrite metadata before the migration system is repaired.",
    "No migration generation was run.",
    `Read ${documentationPath} before making migration-system changes.`,
  ].join("\n"),
);

process.exitCode = 1;
