import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyHelpLifecycle, activeHelpSql } from "../lib/help-lifecycle.ts";
import { formatSlovakCount } from "../lib/slovak-count.ts";

test("explicit closure updates all public flags, archive CTA and SQL active counts together", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE help_cases(id INTEGER,category TEXT,excerpt TEXT,action_label TEXT,resolved INTEGER,urgent INTEGER)",
  );
  const rows = [
    {
      category: "zbierky",
      excerpt: "Ukončená zbierka na operáciu Reiny.",
      actionLabel: "Prispieť",
      resolved: false,
      urgent: true,
    },
    {
      category: "zbierky",
      excerpt: "Zbierka ešte nie je ukončená.",
      actionLabel: "Podporiť",
      resolved: false,
      urgent: true,
    },
    {
      category: "zbierky",
      excerpt: "Operácia môže pomôcť.",
      actionLabel: "Pozrieť ukončenú výzvu",
      resolved: false,
      urgent: true,
    },
    {
      category: "dobrovolnictvo",
      excerpt: "Ukončená zbierka pomohla, teraz potrebujeme venčenie.",
      actionLabel: "Zapojiť sa",
      resolved: false,
      urgent: true,
    },
  ];
  for (const [i, row] of rows.entries())
    db.prepare("INSERT INTO help_cases VALUES(?,?,?,?,?,?)").run(
      i,
      row.category,
      row.excerpt,
      row.actionLabel,
      Number(row.resolved),
      Number(row.urgent),
    );
  const active = db
    .prepare(`SELECT id FROM help_cases WHERE ${activeHelpSql()} ORDER BY id`)
    .all()
    .map((row) => row.id);
  assert.deepEqual(active, [1, 3]);
  const mapped = rows.map(applyHelpLifecycle);
  assert.deepEqual(
    mapped.flatMap((row, i) => (row.resolved ? [] : [i])),
    active,
  );
  assert.equal(mapped[0].urgent, false);
  assert.equal(mapped[0].actionLabel, "Pozrieť ukončenú výzvu");
  assert.equal(mapped[1].urgent, true);
  db.close();
});
test("goal reached, historical description and negated closure cannot independently end a case", () => {
  const item = {
    category: "zbierky",
    excerpt: "Zbierka stále prebieha.",
    description: "Predošlá zbierka bola ukončená.",
    actionLabel: "Podporiť",
    urgent: true,
    resolved: false,
    raisedAmount: 100,
    goalAmount: 100,
  };
  assert.equal(applyHelpLifecycle(item).resolved, false);
  assert.equal(
    applyHelpLifecycle({ ...item, excerpt: "Neukončená zbierka pokračuje." }).resolved,
    false,
  );
  assert.equal(applyHelpLifecycle({ ...item, resolved: true }).urgent, false);
});
test("Slovak event forms include the singular and few cases", () => {
  const forms = { one: "podujatie", few: "podujatia", many: "podujatí" };
  assert.deepEqual(
    [0, 1, 2, 4, 5, 21].map((n) => formatSlovakCount(n, forms)),
    ["0 podujatí", "1 podujatie", "2 podujatia", "4 podujatia", "5 podujatí", "21 podujatí"],
  );
});

test("SQLite and presentation agree for Slovak capitals and absent summaries", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE help_cases(category TEXT,excerpt TEXT,action_label TEXT,resolved INTEGER)");
  db.prepare("INSERT INTO help_cases VALUES(?,?,?,0)").run(
    "zbierky",
    "UKONČENÁ ZBIERKA na operáciu",
    "",
  );
  db.prepare("INSERT INTO help_cases VALUES(?,?,?,0)").run("zbierky", null, null);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM help_cases WHERE ${activeHelpSql()}`).get().n, 1);
  assert.equal(
    applyHelpLifecycle({
      category: "zbierky",
      excerpt: "UKONČENÁ ZBIERKA na operáciu",
      resolved: false,
      urgent: true,
    }).resolved,
    true,
  );
  db.close();
});
