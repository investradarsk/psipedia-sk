import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const SNAPSHOT_FILE_PATTERN = /^(\d{4})_snapshot\.json$/;

function formatIndex(index) {
  return String(index).padStart(4, "0");
}

function validateBaseline(baseline) {
  const errors = [];
  const requiredIntegers = [
    ["sql.firstIndex", baseline?.sql?.firstIndex],
    ["sql.highestIndexAtMig0", baseline?.sql?.highestIndexAtMig0],
    ["journal.frozenLastIndex", baseline?.journal?.frozenLastIndex],
    ["snapshots.frozenHighestIndex", baseline?.snapshots?.frozenHighestIndex],
    ["historicalUnjournaledSql.firstIndex", baseline?.historicalUnjournaledSql?.firstIndex],
    ["historicalUnjournaledSql.lastIndex", baseline?.historicalUnjournaledSql?.lastIndex],
  ];

  if (baseline?.version !== 1) {
    errors.push("Migration safety baseline must have version 1.");
  }
  if (baseline?.status !== "known-hybrid-migration-baseline") {
    errors.push('Migration safety baseline status must be "known-hybrid-migration-baseline".');
  }
  if (typeof baseline?.documentation !== "string" || baseline.documentation.length === 0) {
    errors.push("Migration safety baseline must declare its documentation path.");
  }
  for (const [label, value] of requiredIntegers) {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`Migration safety baseline ${label} must be a non-negative integer.`);
    }
  }
  if (baseline?.sql?.requireContiguousSequence !== true) {
    errors.push("Migration safety baseline must require a contiguous SQL sequence.");
  }
  if (baseline?.sql?.allowAppendAfterBaseline !== true) {
    errors.push("Migration safety baseline must explicitly allow reviewed SQL appends after the MIG-0 baseline.");
  }
  if (baseline?.sql?.firstIndex !== 0) {
    errors.push("Migration safety baseline sql.firstIndex must remain 0.");
  }
  if (baseline?.snapshots?.frozenHighestIndex !== baseline?.journal?.frozenLastIndex) {
    errors.push("Frozen snapshot index must match the frozen Drizzle journal index.");
  }
  if (baseline?.historicalUnjournaledSql?.firstIndex !== baseline?.journal?.frozenLastIndex + 1) {
    errors.push("Historical unjournaled SQL must begin immediately after the frozen journal index.");
  }
  if (baseline?.historicalUnjournaledSql?.lastIndex !== baseline?.sql?.highestIndexAtMig0) {
    errors.push("Historical unjournaled SQL must end at sql.highestIndexAtMig0.");
  }
  if (typeof baseline?.journal?.frozenLastTag !== "string" || baseline.journal.frozenLastTag.length === 0) {
    errors.push("Migration safety baseline must declare journal.frozenLastTag.");
  }
  return errors;
}

function parseIndexedFiles(fileNames, pattern, kind, errors) {
  const parsed = [];
  for (const fileName of fileNames) {
    const match = pattern.exec(fileName);
    if (!match) {
      errors.push(`Invalid ${kind} filename: ${fileName}`);
      continue;
    }
    parsed.push({ fileName, index: Number(match[1]) });
  }

  const filesByIndex = new Map();
  for (const entry of parsed) {
    const existing = filesByIndex.get(entry.index) ?? [];
    existing.push(entry.fileName);
    filesByIndex.set(entry.index, existing);
  }
  for (const [index, names] of filesByIndex) {
    if (names.length > 1) {
      errors.push(`Duplicate ${kind} index ${formatIndex(index)}: ${names.join(", ")}`);
    }
  }

  return { parsed, filesByIndex };
}

function checkContiguousIndexes(filesByIndex, firstIndex, highestIndex, kind, errors) {
  for (let index = firstIndex; index <= highestIndex; index += 1) {
    if (!filesByIndex.has(index)) {
      errors.push(`Missing ${kind} index ${formatIndex(index)} (gap in required contiguous sequence).`);
    }
  }
}

function migrationStem(fileName) {
  return fileName.slice(0, -".sql".length);
}

export function validateMigrationSafety({ migrationFileNames, snapshotFileNames, journal, baseline }) {
  const errors = validateBaseline(baseline);

  const migrationFiles = parseIndexedFiles(
    migrationFileNames,
    MIGRATION_FILE_PATTERN,
    "migration",
    errors,
  );
  const migrationIndexes = migrationFiles.parsed.map(({ index }) => index);
  const highestSqlIndex = migrationIndexes.length > 0 ? Math.max(...migrationIndexes) : -1;

  if (highestSqlIndex < baseline.sql.highestIndexAtMig0) {
    errors.push(
      `SQL migration chain ends at ${formatIndex(highestSqlIndex)}, below MIG-0 baseline ${formatIndex(baseline.sql.highestIndexAtMig0)}.`,
    );
  }
  if (baseline.sql.requireContiguousSequence && highestSqlIndex >= baseline.sql.firstIndex) {
    checkContiguousIndexes(
      migrationFiles.filesByIndex,
      baseline.sql.firstIndex,
      highestSqlIndex,
      "migration",
      errors,
    );
  }

  const entries = Array.isArray(journal?.entries) ? journal.entries : [];
  if (!Array.isArray(journal?.entries)) {
    errors.push("Drizzle journal entries must be an array.");
  }

  const journalIndexes = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry?.idx) || entry.idx < 0) {
      errors.push("Drizzle journal contains a non-integer or negative idx.");
      continue;
    }
    if (journalIndexes.has(entry.idx)) {
      errors.push(`Duplicate Drizzle journal idx ${formatIndex(entry.idx)}.`);
    }
    journalIndexes.set(entry.idx, entry);
  }

  const validJournalIndexes = entries
    .filter((entry) => Number.isInteger(entry?.idx))
    .map((entry) => entry.idx);
  const actualJournalLastIndex = validJournalIndexes.length > 0 ? Math.max(...validJournalIndexes) : -1;
  const journalLastEntry = journalIndexes.get(actualJournalLastIndex);

  if (actualJournalLastIndex !== baseline.journal.frozenLastIndex) {
    errors.push(
      `Drizzle journal moved from frozen MIG-0 index ${formatIndex(baseline.journal.frozenLastIndex)} to ${formatIndex(actualJournalLastIndex)}. Do not use drizzle-kit generate before migration repair.`,
    );
  }
  if (journalLastEntry?.tag !== baseline.journal.frozenLastTag) {
    errors.push(
      `Drizzle journal last tag must remain ${baseline.journal.frozenLastTag}; found ${journalLastEntry?.tag ?? "<missing>"}.`,
    );
  }

  for (let index = 0; index <= baseline.journal.frozenLastIndex; index += 1) {
    const journalEntry = journalIndexes.get(index);
    if (!journalEntry) {
      errors.push(`Missing Drizzle journal idx ${formatIndex(index)}.`);
      continue;
    }
    const sqlNames = migrationFiles.filesByIndex.get(index) ?? [];
    if (sqlNames.length === 1) {
      const expectedTag = migrationStem(sqlNames[0]);
      if (journalEntry.tag !== expectedTag) {
        errors.push(
          `Drizzle journal tag mismatch at ${formatIndex(index)}: expected ${expectedTag}, found ${journalEntry.tag ?? "<missing>"}.`,
        );
      }
    }
  }

  const snapshots = parseIndexedFiles(
    snapshotFileNames,
    SNAPSHOT_FILE_PATTERN,
    "snapshot",
    errors,
  );
  const snapshotIndexes = snapshots.parsed.map(({ index }) => index);
  const highestSnapshotIndex = snapshotIndexes.length > 0 ? Math.max(...snapshotIndexes) : -1;
  if (highestSnapshotIndex !== baseline.snapshots.frozenHighestIndex) {
    errors.push(
      `Drizzle snapshots moved from frozen MIG-0 index ${formatIndex(baseline.snapshots.frozenHighestIndex)} to ${formatIndex(highestSnapshotIndex)}.`,
    );
  }
  if (highestSnapshotIndex >= 0) {
    checkContiguousIndexes(
      snapshots.filesByIndex,
      0,
      highestSnapshotIndex,
      "snapshot",
      errors,
    );
  }

  return {
    errors,
    summary: {
      highestSqlIndex,
      journalLastIndex: actualJournalLastIndex,
      journalLastTag: journalLastEntry?.tag ?? null,
      highestSnapshotIndex,
      historicalUnjournaledFirstIndex: baseline.historicalUnjournaledSql.firstIndex,
      historicalUnjournaledLastIndex: baseline.historicalUnjournaledSql.lastIndex,
    },
  };
}

export async function loadMigrationSafetyState(repoRoot) {
  const baselinePath = path.join(repoRoot, "migration-safety.baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const migrationDirectory = path.join(repoRoot, "drizzle");
  const metaDirectory = path.join(migrationDirectory, "meta");
  const migrationEntries = await readdir(migrationDirectory, { withFileTypes: true });
  const metaEntries = await readdir(metaDirectory, { withFileTypes: true });

  const migrationFileNames = migrationEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const snapshotFileNames = metaEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith("_snapshot.json"))
    .map((entry) => entry.name)
    .sort();
  const journal = JSON.parse(await readFile(path.join(metaDirectory, "_journal.json"), "utf8"));

  return { migrationFileNames, snapshotFileNames, journal, baseline };
}

export async function checkMigrationSafety(repoRoot) {
  const state = await loadMigrationSafetyState(repoRoot);
  return validateMigrationSafety(state);
}

async function runCli() {
  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(currentFile), "..");
  const result = await checkMigrationSafety(repoRoot);
  if (result.errors.length > 0) {
    console.error("Migration safety check FAILED:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    console.error("See docs/MIGRATION-SAFETY-SK.md.");
    process.exitCode = 1;
    return;
  }

  const { summary } = result;
  console.log(
    `Migration safety OK: SQL ${formatIndex(0)}-${formatIndex(summary.highestSqlIndex)}; ` +
      `Drizzle journal frozen at ${formatIndex(summary.journalLastIndex)}; ` +
      `snapshots frozen at ${formatIndex(summary.highestSnapshotIndex)}; ` +
      `known historical unjournaled SQL ${formatIndex(summary.historicalUnjournaledFirstIndex)}-${formatIndex(summary.historicalUnjournaledLastIndex)} preserved.`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runCli();
}
