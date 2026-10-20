# PUBLIC PERFORMANCE COMPARATOR V2 — offline Lighthouse summary comparison

This utility compares **existing, sanitized** `summary.json` artifacts created by
`scripts/web-perf-observability.mjs`. It does **not** invoke Lighthouse, Chrome,
CrUX, HTTP probes, builds, deployments, or external APIs. No changes to the
measurement script, its schedule/CI, `package.json`, or the public web are needed.

## Preconditions: identify the live production deployments

A measurement's `manifest.git_sha` is the **checkout containing the collector**,
not proof of the code deployed to `https://psipedia.sk`. Independently obtain the
production git SHA serving the site **at the time of each Lighthouse run** (for
example, from the Cloudflare deployment record). Supply those identifiers
explicitly as `--before-deploy-sha` and `--after-deploy-sha`. Both must be 7–40
hex characters; use the same identifier type for each. An existing
`manifest.production_deployment_sha`, if present in a future artifact, must
match the supplied value. A different production SHA before and after is
**expected** for an optimization comparison, not an error.

The tool cannot verify Cloudflare records offline. Supplying unverified SHAs
is an operator attestation, **not independently verified proof**. If you cannot
identify either production deployment, **do not use the comparison to claim
an improvement**. It never substitutes the checkout `git_sha` for a deployment.

## Run (Node 22+, no install)

Archive/download the existing two **summary.json** artifacts locally. Prefer
`baseline` against `baseline` (three successful Lighthouse runs per URL/device)
in comparable production and network conditions.

```bash
node --test tests/web-perf-compare.test.mjs
node scripts/web-perf-compare.mjs \
  --before /local/before/summary.json \
  --after /local/after/summary.json \
  --before-deploy-sha 0123456789abcdef0123456789abcdef01234567 \
  --after-deploy-sha fedcba9876543210fedcba9876543210fedcba98 \
  --out /local/results/web-perf-compare
```

All paths and deployment SHAs above are **synthetic examples**. The tool only
reads the two local JSON files and writes `compare.json` + `compare.md` to
`--out`. It does not make any outbound requests. Input validation and the
comparability gate run **before** output files are created. If the gate fails,
exit code is nonzero and only a constant diagnostic label is printed.

## Strict comparability gate

The input must be collector `schema_version: 2` from production
`https://psipedia.sk`. The tool refuses missing or mismatching:

- environment (any explicit non-production environment is rejected);
- independent production deployment SHA attestation (or a mismatch with
  `manifest.production_deployment_sha` if present);
- source, mode (`weekly` / `quick` / `baseline`), repeats, page count, device
  count, planned slot count;
- runner OS, Node, Chrome, Lighthouse, throttling method, mobile/desktop
  profile, and optional CrUX field-data configuration.

Malformed input, unsupported schema, missing core metadata, duplicate path /
device rows, invalid paths or impossible run plans are rejected. The source
measurement checkout Git SHAs may legitimately differ and are recorded for
traceability **without being used as deployment identities**. Unrecorded
external factors (CDN cache, site load, network variability, CrUX rolling
window, time of day) cannot be confirmed from these artifacts; small metric
differences are **directional, not statistically established improvements**.

A missing page/device row is recorded as `MISSING_URL` rather than breaking
the entire analysis; an HTTP failure is `UNAVAILABLE_URL`; fewer than the
manifest's full planned successful runs is `INCOMPLETE_MEASUREMENT`. These slots
are excluded from metric-direction counts and have `UNKNOWN` deltas — even if
the partial summary contains numeric medians. A URL that is absent from **both**
inputs and not represented by either `lab_rows` array cannot be discovered by
this offline tool; verify route inventory against the collector manifest.

## Metrics and interpretation

For each **path + device**, compute `after − before` and percentage change from
before. Lower is better for LCP (ms), CLS (unitless), observed navigation TTFB
(ms), TBT (ms), JS/CSS/image transferred bytes. Higher is better for Lighthouse
Performance score (0–100). Zero is a valid measurement; percentage delta is
`null` if the baseline is zero. A missing, null, non-finite, or `UNKNOWN`
measurement yields JSON `null` and status `UNKNOWN`, **never zero**. The tool
does not convert a string to a numeric measurement.

`field_inp_p75_ms` is present **only if** existing CrUX status was `available`
and scope was `url`; it is retained in a separate informational section. It is
never synthesized from TBT, compared directly to laboratory metrics, or
counted as a Lighthouse improvement.

The Markdown report summarizes comparable/missing/unavailable/incomplete
slots and metric directions, then details every metric by URL and device.
The JSON schema is a self-contained read-only result (version 1).

## Synthetic example (not a real Psipedia performance finding)

Example for one **mobile** page/device row, with a complete 3/3 baseline on
both sides and separately attested deployment SHAs:

```json
{
  "path": "/",
  "device": "mobile",
  "status": "COMPARABLE",
  "before": { "http_status": 200, "runs": 3, "successful_runs": 3, "expected_runs": 3, "field_inp_p75_ms": null, "field_status": "not_configured" },
  "after": { "http_status": 200, "runs": 3, "successful_runs": 3, "expected_runs": 3, "field_inp_p75_ms": null, "field_status": "not_configured" },
  "metrics": {
    "lcp_ms": { "before": 3000, "after": 2500, "delta": -500, "delta_percent": -16.666666666666664, "status": "IMPROVEMENT" },
    "score": { "before": 70, "after": 80, "delta": 10, "delta_percent": 14.285714285714285, "status": "IMPROVEMENT" }
  }
}
```

In the real `compare.json`, `metrics` includes all **eight** laboratory
metrics, and the parent object also includes the comparison config, deployment
attestations, totals and all page/device slots. The abbreviated object above
illustrates the shape, not a complete standalone output file.

Example Markdown excerpt:

```markdown
| URL | Device | Slot status | Metric | Before | After | Δ after−before | Δ % | Direction |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| / | mobile | COMPARABLE | LCP (ms) | 3000 | 2500 | -500 | -16.667% | IMPROVEMENT |
| / | mobile | COMPARABLE | Lighthouse score (points) | 70 | 80 | +10 | +14.286% | IMPROVEMENT |
```

## Review / merge safety

Run only the offline tests and compare existing measurements. Do **not** trigger
`WEB-PERF Observability` Quick/Baseline just to test this comparator. There is
no new scheduled job, no changes to existing CI, and no deployment or database
interaction. Keep this implementation as a separate **Draft PR** until reviewed.
