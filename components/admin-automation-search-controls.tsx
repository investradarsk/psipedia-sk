"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AutomationDiscoveryRoot } from "@/lib/data-automation-discovery-store";
import styles from "./admin-operations-ux.module.css";

export function AdminAutomationSearchControls({
  categorySlug,
  roots,
}: {
  categorySlug: string;
  roots: AutomationDiscoveryRoot[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"extend" | "run" | null>(null);
  const [message, setMessage] = useState("");
  const summary = useMemo(() => {
    const requestsToday = roots.reduce((sum, root) => sum + (root.searchSafety?.requestsToday ?? 0), 0);
    const dailyLimit = roots.reduce((sum, root) => sum + (root.searchSafety?.rootDailyLimit ?? 0), 0);
    const exhaustedRoots = roots.filter((root) => root.searchSafety && root.searchSafety.remainingRootRequests <= 0).length;
    const addressEnrichmentRequestsToday = roots.reduce(
      (sum, root) => sum + (root.searchSafety?.addressEnrichmentRequestsToday ?? 0),
      0,
    );
    const addressEnrichmentDailyLimit = roots.reduce(
      (sum, root) => sum + (root.searchSafety?.addressEnrichmentDailyLimit ?? 0),
      0,
    );
    const enabledRoots = roots.filter((root) => root.enabled && root.reviewStatus === "APPROVED").length;
    const lastQueryAt = roots.map((root) => root.searchSafety?.lastQueryAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return {
      requestsToday,
      dailyLimit,
      exhaustedRoots,
      addressEnrichmentRequestsToday,
      addressEnrichmentDailyLimit,
      enabledRoots,
      lastQueryAt,
    };
  }, [roots]);

  async function action(kind: "extend-budget" | "run") {
    setBusy(kind === "extend-budget" ? "extend" : "run");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/automation-categories/${categorySlug}/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: kind }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        extraRequests?: number;
        startedRootCount?: number;
        blockedRootCount?: number;
      };
      if (!response.ok) throw new Error(payload.error || "Akciu hľadania sa nepodarilo vykonať.");
      if (kind === "extend-budget") {
        setMessage(`Limit bol obnovený. Povolených je ďalších ${payload.extraRequests ?? 0} requestov; pôvodná spotreba zostala v audite.`);
      } else {
        const started = payload.startedRootCount ?? 0;
        const blocked = payload.blockedRootCount ?? 0;
        if (started <= 0) throw new Error(payload.error || "Hľadanie sa nespustilo.");
        setMessage(blocked
          ? `Hľadanie sa spustilo pre ${started} častí kategórie. ${blocked} častí sa nespustilo pre limit, governance alebo už aktívny run.`
          : "Hľadanie sa práve spustilo.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Akciu hľadania sa nepodarilo vykonať.");
    } finally {
      setBusy(null);
    }
  }

  if (!roots.length) return null;

  return (
    <section className={styles.section} aria-labelledby="search-budget-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="search-budget-heading">Stav dnešného hľadania</h2>
          <p>Hľadanie nových entít používa discovery limit. Pri adresárových profiloch môže aj kontrola existujúcich záznamov použiť samostatný bounded Tavily lookup, iba keď dostupné údaje nestačia na presné overenie adresy cez Geoapify.</p>
        </div>
      </div>
      <p><strong>Dnešné využitie:</strong> {summary.requestsToday} / {summary.dailyLimit} requestov</p>
      {summary.exhaustedRoots > 0
        ? <p role="status"><strong>Dnešný limit je vyčerpaný</strong>{roots.length > 1 ? ` pre ${summary.exhaustedRoots} z ${roots.length} častí kategórie.` : "."}</p>
        : <p>Dnešný limit ešte nie je vyčerpaný.</p>}
      {summary.addressEnrichmentDailyLimit > 0 && (
        <p>
          <strong>Dohľadanie presnej adresy:</strong>{" "}
          {summary.addressEnrichmentRequestsToday} / {summary.addressEnrichmentDailyLimit} requestov
          {" "}· Geoapify sa vždy pokúsi overiť dostupnú adresu najprv; Tavily sa použije až keď dôkaz nestačí.
        </p>
      )}
      {summary.lastQueryAt && <p>Posledné hľadanie: {new Date(summary.lastQueryAt).toLocaleString("sk-SK")}</p>}
      <div className="admin-form-actions">
        {summary.exhaustedRoots > 0 && (
          <button type="button" disabled={busy !== null} onClick={() => void action("extend-budget")}>
            {busy === "extend" ? "Obnovujem…" : "Obnoviť limit"}
          </button>
        )}
        <button className="is-primary" type="button" disabled={busy !== null || summary.enabledRoots === 0} onClick={() => void action("run")}>
          {busy === "run" ? "Spúšťam…" : "Spustiť hľadanie"}
        </button>
      </div>
      {message && <p className="admin-flash" role="status">{message}</p>}
    </section>
  );
}
