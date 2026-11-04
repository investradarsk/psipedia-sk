"use client";

import { useEffect, useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin-interaction-system";
import {
  FACEBOOK_PLAN_WEEKDAYS,
  bratislavaToday,
  facebookPlanAddDays,
  facebookPlanSlotsForDay,
  facebookPlanWeekStart,
  type FacebookPlanKey,
} from "@/lib/facebook-weekly-plan";
import styles from "./admin-facebook-weekly-planner.module.css";

type Mark = { slot_date: string; slot_key: FacebookPlanKey };
type Data = { weekStart: string; marks: Mark[]; error?: string };

function markId(date: string, key: FacebookPlanKey) {
  return date + "|" + key;
}

function shortDate(date: string) {
  const [year, month, day] = date.split("-");
  return day + ". " + month + ". " + year;
}

function currentDayIndex(today: string) {
  return (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
}

/** A small owner-only manual checklist, separate from the actual FB publisher. */
export function AdminFacebookWeeklyPlanner() {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<0 | 1>(0);
  const [day, setDay] = useState(0);
  const [weekStart, setWeekStart] = useState(() => facebookPlanWeekStart());
  const [today, setToday] = useState(() => bratislavaToday());
  const [marks, setMarks] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  async function load() {
    setLoading(true);
    setAvailable(false);
    setError("");
    try {
      const response = await fetch("/api/admin/facebook-weekly-plan", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json() as Data;
      if (!response.ok || !Array.isArray(result.marks)) {
        throw new Error(result.error || "Kalendár sa nepodarilo načítať.");
      }
      setWeekStart(result.weekStart);
      setMarks(new Set(result.marks.map((mark) => markId(mark.slot_date, mark.slot_key))));
      setToday(bratislavaToday());
      setAvailable(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Načítanie zlyhalo.");
    } finally {
      setLoading(false);
    }
  }

  function showCalendar() {
    setWeek(0);
    setDay(currentDayIndex(bratislavaToday()));
    setWeekStart(facebookPlanWeekStart());
    setToday(bratislavaToday());
    setOpen(true);
    void load();
  }

  function closeCalendar() {
    dialog.current?.close();
    setOpen(false);
  }

  async function toggle(date: string, key: FacebookPlanKey) {
    const id = markId(date, key);
    if (!available || saving || loading || date < today) return;
    const next = !marks.has(id);
    setSaving(id);
    setError("");

    try {
      const response = await fetch("/api/admin/facebook-weekly-plan", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, slotKey: key, planned: next }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Zmenu sa nepodarilo uložiť.");
      }
      setMarks((previous) => {
        const changed = new Set(previous);
        if (next) changed.add(id);
        else changed.delete(id);
        return changed;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Uloženie zlyhalo.");
    } finally {
      setSaving(null);
    }
  }

  const start = facebookPlanAddDays(weekStart, week * 7);
  const dates = Array.from({ length: 7 }, (_, index) => facebookPlanAddDays(start, index));
  const done = dates.reduce((total, date) => {
    return total + facebookPlanSlotsForDay(dates.indexOf(date), date).filter((slot) =>
      marks.has(markId(date, slot.key))).length;
  }, 0);

  return (
    <div className={styles.launch}>
      <AdminActionButton type="button" variant="primary" onClick={showCalendar}>
        Týždenný kalendár
      </AdminActionButton>
      <p>Dva týždne · 8 príspevkov denne · kliknutím označíš naplánované</p>

      {open && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby="facebook-weekly-plan-heading"
          onClose={() => setOpen(false)}
        >
          <header className={styles.heading}>
            <div>
              <h2 id="facebook-weekly-plan-heading">Týždenný FB kalendár</h2>
              <p>Pracovná evidencia pre Psipedia.sk · 8 typov denne · bez Stories</p>
            </div>
            <button type="button" className={styles.close} onClick={closeCalendar}>
              Zavrieť
            </button>
          </header>

          <div className={styles.navigation}>
            <div className={styles.weekButtons} aria-label="Výber týždňa">
              <button type="button" aria-pressed={week === 0} onClick={() => {
                setWeek(0);
                setDay(currentDayIndex(today));
              }}>Tento týždeň</button>
              <button type="button" aria-pressed={week === 1} onClick={() => {
                setWeek(1);
                setDay(0);
              }}>Budúci týždeň</button>
            </div>
            <span className={styles.summary}>
              {shortDate(start)} – {shortDate(dates[6])} · {done}/56 naplánovaných
            </span>
          </div>

          {error && <p role="alert" className={styles.error}>{error}</p>}
          {loading && <p role="status" className={styles.helper}>Načítavam uložené označenia…</p>}

          <nav className={styles.dayButtons} aria-label="Výber dňa v mobile">
            {FACEBOOK_PLAN_WEEKDAYS.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={day === index}
                onClick={() => setDay(index)}
              >
                {name.slice(0, 2)} {dates[index].slice(8)}
              </button>
            ))}
          </nav>

          <div className={styles.grid}>
            {dates.map((date, index) => {
              const past = date < today;
              const slots = facebookPlanSlotsForDay(index, date);
              return (
                <section
                  key={date}
                  className={[styles.day, past ? styles.dayPast : ""].join(" ")}
                  data-selected={day === index ? "true" : "false"}
                  aria-label={FACEBOOK_PLAN_WEEKDAYS[index] + " " + shortDate(date)}
                >
                  <div className={styles.dayTitle}>
                    <strong>{FACEBOOK_PLAN_WEEKDAYS[index]}</strong>
                    <time dateTime={date}>{shortDate(date)}</time>
                  </div>
                  <div className={styles.slots}>
                    {slots.map((slot) => {
                      const id = markId(date, slot.key);
                      const planned = marks.has(id);
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          className={[styles.slot, planned ? styles.slotDone : ""].join(" ")}
                          aria-pressed={planned}
                          aria-label={slot.time + " " + slot.label +
                            (planned ? " – naplánované" : " – nenaplánované")}
                          disabled={loading || !available || saving !== null || past}
                          onClick={() => void toggle(date, slot.key)}
                        >
                          <span className={styles.slotTop}>
                            <time>{slot.time}</time>
                            <span aria-hidden="true">{planned ? "✓" : "○"}</span>
                          </span>
                          <span className={styles.slotLabel}>{slot.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <p className={styles.footer}>
            Zelená znamená, že si príspevok ručne označil ako naplánovaný.
            Toto označenie samo nič neodosiela na Facebook. Ukladá sa do D1,
            takže ho uvidíš aj na inom zariadení. Predošlé dni sa neupravujú
            a staré týždne sa prestanú zobrazovať.
          </p>
        </dialog>
      )}
    </div>
  );
}
