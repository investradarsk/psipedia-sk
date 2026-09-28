"use client";

import {
  AUTOMATION_TIMEZONE,
  AUTOMATION_WEEKDAYS,
  formatAutomationScheduleSummary,
  type AutomationSchedule,
  type AutomationWeekday,
} from "@/lib/automation-schedule";
import styles from "./admin-automation-schedule-fields.module.css";

const weekdayLabels: Record<AutomationWeekday, string> = {
  MON: "Po",
  TUE: "Ut",
  WED: "St",
  THU: "Št",
  FRI: "Pi",
  SAT: "So",
  SUN: "Ne",
};

export function AdminAutomationScheduleFields({
  schedule,
  onChange,
  intervalOptions,
  disabled = false,
  intervalLabel = "Ako často",
}: {
  schedule: AutomationSchedule;
  onChange: (schedule: AutomationSchedule) => void;
  intervalOptions: ReadonlyArray<{ minutes: number; label: string }>;
  disabled?: boolean;
  intervalLabel?: string;
}) {
  const fallbackInterval = intervalOptions[0]?.minutes ?? 1440;

  function setMode(mode: AutomationSchedule["mode"]) {
    if (mode === schedule.mode) return;
    onChange(mode === "INTERVAL"
      ? { mode: "INTERVAL", intervalMinutes: fallbackInterval }
      : {
          mode: "CALENDAR",
          daysOfWeek: ["MON"],
          localTime: "08:00",
          timezone: AUTOMATION_TIMEZONE,
        });
  }

  function toggleDay(day: AutomationWeekday) {
    if (schedule.mode !== "CALENDAR") return;
    const selected = new Set(schedule.daysOfWeek);
    if (selected.has(day)) {
      if (selected.size === 1) return;
      selected.delete(day);
    } else {
      selected.add(day);
    }
    onChange({
      ...schedule,
      daysOfWeek: AUTOMATION_WEEKDAYS.filter((weekday) => selected.has(weekday)),
    });
  }

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend>Spôsob plánovania</legend>
      <div className={styles.modeRow}>
        <label>
          <input
            type="radio"
            name={"schedule-mode-" + intervalLabel}
            value="INTERVAL"
            checked={schedule.mode === "INTERVAL"}
            onChange={() => setMode("INTERVAL")}
          />
          Interval
        </label>
        <label>
          <input
            type="radio"
            name={"schedule-mode-" + intervalLabel}
            value="CALENDAR"
            checked={schedule.mode === "CALENDAR"}
            onChange={() => setMode("CALENDAR")}
          />
          Presný rozvrh
        </label>
      </div>

      {schedule.mode === "INTERVAL" ? (
        <label className="admin-field">
          <span>{intervalLabel}</span>
          <select
            value={schedule.intervalMinutes}
            onChange={(event) => onChange({ mode: "INTERVAL", intervalMinutes: Number(event.target.value) })}
          >
            {intervalOptions.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : (
        <div className={styles.calendarFields}>
          <div>
            <span className={styles.label}>Dni</span>
            <div className={styles.weekdayRow} role="group" aria-label="Dni v týždni">
              {AUTOMATION_WEEKDAYS.map((day) => {
                const pressed = schedule.daysOfWeek.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={styles.weekday}
                    aria-pressed={pressed}
                    onClick={() => toggleDay(day)}
                    title={pressed && schedule.daysOfWeek.length === 1 ? "Musí zostať vybraný aspoň jeden deň." : undefined}
                  >
                    {weekdayLabels[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="admin-field">
            <span>Čas</span>
            <input
              type="time"
              step="60"
              value={schedule.localTime}
              onChange={(event) => onChange({ ...schedule, localTime: event.target.value })}
              required
            />
          </label>
          <p className={styles.timezone}>Časové pásmo: Slovensko — {AUTOMATION_TIMEZONE}</p>
        </div>
      )}

      <p className={styles.summary}>Rozvrh: {formatAutomationScheduleSummary(schedule)}</p>
    </fieldset>
  );
}
