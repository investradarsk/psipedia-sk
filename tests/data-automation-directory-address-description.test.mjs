import assert from "node:assert/strict";
import test from "node:test";
import { enrichDirectoryProposalAddress } from "../lib/data-automation-direct-entity.ts";

test("DIRECTORY direct discovery promotes one explicit postal address from description", () => {
  const proposed = enrichDirectoryProposalAddress({
    name: "Veterinárna ambulancia Nitra",
    category: "veterinari",
    description: "Veterinárna ambulancia pre malé zvieratá. Adresa: Hlavná 12, 949 01 Nitra.",
  });

  assert.equal(proposed.address, "Hlavná 12, 949 01 Nitra");
  assert.equal(proposed.street, "Hlavná");
  assert.equal(proposed.houseNumber, "12");
  assert.equal(proposed.postalCode, "949 01");
  assert.equal(proposed.city, "Nitra");
  assert.equal(proposed.addressFormat, "STREET");
  assert.match(proposed.description, /Adresa: Hlavná 12/);
});

test("DIRECTORY direct discovery accepts a comma-delimited Slovak address in meta-style description", () => {
  const proposed = enrichDirectoryProposalAddress({
    name: "Veterinárna klinika Ružinov",
    category: "veterinari",
    description: "Veterinárna klinika Ružinov, Ružinovská 1/4814, 82102 Bratislava - Ružinov.",
  });

  assert.equal(proposed.address, "Ružinovská 1/4814, 82102 Bratislava - Ružinov");
  assert.equal(proposed.street, "Ružinovská");
  assert.equal(proposed.houseNumber, "1/4814");
  assert.equal(proposed.postalCode, "82102");
  assert.equal(proposed.city, "Bratislava - Ružinov");
});

test("DIRECTORY direct discovery never overwrites structured address evidence", () => {
  const original = {
    name: "Veterinár",
    category: "veterinari",
    description: "Adresa: Iná 9, 949 01 Nitra.",
    address: "Hlavná 1, 811 01 Bratislava",
    street: "Hlavná",
    houseNumber: "1",
    postalCode: "811 01",
    city: "Bratislava",
    addressFormat: "STREET",
  };
  assert.equal(enrichDirectoryProposalAddress(original), original);
});

test("DIRECTORY direct discovery fails closed for weak or ambiguous description addresses", () => {
  const weak = {
    name: "Veterinár",
    category: "veterinari",
    description: "Navštívte nás na Hlavná 1, 949 01 Nitra.",
  };
  assert.equal(enrichDirectoryProposalAddress(weak), weak);

  const ambiguous = {
    name: "Veterinár",
    category: "veterinari",
    description: "Prevádzky: Hlavná 1, 949 01 Nitra. Druhá 2, 811 01 Bratislava.",
  };
  assert.equal(enrichDirectoryProposalAddress(ambiguous), ambiguous);

  const withoutPostalCode = {
    name: "Veterinár",
    category: "veterinari",
    description: "Adresa: Hlavná 1, Nitra.",
  };
  assert.equal(enrichDirectoryProposalAddress(withoutPostalCode), withoutPostalCode);
});
