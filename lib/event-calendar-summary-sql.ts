/**
 * Aggregate public calendar days after filtering the month's candidate events.
 *
 * The prior days-first JOIN evaluated the public event predicate for each of
 * the 28-31 days, causing repeated managed_events reads on every calendar
 * request. MATERIALIZED scopes the eligible rows to the month exactly once;
 * CROSS JOIN fixes the loop order so SQLite doesn't rescan managed_events per
 * day. The resulting (day, event type, count) set is unchanged.
 *
 * The whereClause must come from the trusted eventListingSql() builder.
 * Bound user values stay in placeholders in the caller.
 */
export function publicEventCalendarSummarySql(whereClause: string): string {
  return `WITH RECURSIVE days(day) AS (
    SELECT ? UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < ?
  ), matching_events AS MATERIALIZED (
    SELECT event_type, start_date,
      COALESCE(NULLIF(end_date, ''), start_date) AS last_date
    FROM managed_events
    WHERE ${whereClause}
      AND start_date <= ?
      AND COALESCE(NULLIF(end_date, ''), start_date) >= ?
  )
  SELECT days.day AS date, matching_events.event_type AS type, COUNT(*) AS count
  FROM matching_events CROSS JOIN days
  WHERE matching_events.start_date <= days.day
    AND matching_events.last_date >= days.day
  GROUP BY days.day, matching_events.event_type`;
}
