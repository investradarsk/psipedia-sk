import fs from "node:fs/promises";

function deterministicTestKey(byte) {
  return Buffer.alloc(32, byte).toString("base64url");
}

const content = [
  "# CI-only synthetic keys. Never use as production secrets.",
  `PII_ENCRYPTION_KEY=${deterministicTestKey(0x31)}`,
  `PII_HASH_KEY=${deterministicTestKey(0x32)}`,
  "",
].join("\n");

await fs.writeFile(".dev.vars", content, { encoding: "utf8", mode: 0o600 });
console.log("Wrote CI-only .dev.vars with synthetic PII test keys.");
