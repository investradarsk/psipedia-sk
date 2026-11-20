# One-time Help legacy SQL removal, Notion unchanged
After #1488, 36 old adoption and 104 shelter rows still exist in `help_cases`. The canonical tables already own the public data.

This PR removes the temporary Admin "Historické kópie" page, API and Notion-trash lifecycle opt-in. **No Notion page is modified, archived or trashed.** All technical JSON stays.

The one-off production GitHub Action runs only on the explicitly named merged main commit, inside the protected `production` environment; it can also be manually retried with exact confirmation `VYMAZAT LEN 140 SQL KOPII NOTION PONECHAT`. It submits **one atomic D1 /query batch** with strict in-transaction checks: 36 adoption +104 shelters +0 lost, 140 published unique slugs, 36 and 94 canonical pairs, 10 owner-approved absent shelters, 140 old Notion mappings, no canonical page-ID reuse, no partner claims, no other tombstones, and active deletion guard.

The batch writes 140 SQL-only tombstones (Notion page IDs retained as anti-reimport evidence, explicitly marked `HISTORICAL_SQL_ONLY_NOTION_RETAINED`), stops old local transfer work, deletes only D1 obsolete sync links and 140 historic `help_cases` rows. The `admin_guarded_help_delete` trigger is not dropped. Every postcondition is checked in the **same batch**, and a failed CHECK rolls everything back.

No numbered SQL migration, no manual Admin form, no backup workflow. After confirmed 140/140 completion subsequent invocations are no-op. If actual counts differ, nothing is changed; user must inspect the source-of-truth discrepancy before retrying.
