import { eventFoldSource, eventFoldTarget, eventOtherFolds } from './event-search-unicode';
import { bratislavaDateKey, eventMonthFilterFromParam, eventRegionFilterFromParam, eventSearchQueryFromParam, eventTimeFilterFromParam, eventTimeFilterParam, eventTypes, eventTypePortalHref, type EventType } from './events';
import { calendarMonthBounds } from './event-calendar-view';
export const EVENT_PAGE_SIZE = 12;
export function normalizeEventSearch(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sk').trim(); }
export function parseEventListing(raw: Record<string, string | string[] | undefined>, type: EventType | 'Všetky' = 'Všetky') {
    const scalar = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]) ?? '';
    const date = (key: string) => { const v = scalar(key); return /^20\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v ? v : ''; };
    const from = date('od'), to = date('do');
    const page = /^\d{1,7}$/.test(scalar('strana')) ? Math.max(1, Number(scalar('strana'))) : 1;
    return { query: eventSearchQueryFromParam(raw.q), region: eventRegionFilterFromParam(raw.region), month: eventMonthFilterFromParam(raw.mesiac), time: eventTimeFilterFromParam(raw.termin), type, from, to, city: scalar('mesto').trim().slice(0, 120), page, sort: ['najblizsie', 'najnovsie'].includes(scalar('zoradenie')) ? scalar('zoradenie') : '', error: from && to && from > to ? 'Dátum od musí byť pred dátumom do alebo rovnaký.' : '' };
}
export type EventListingFilters = ReturnType<typeof parseEventListing>;
export function eventListingParams(f: EventListingFilters) {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: f.query, region: f.region, mesiac: f.month, termin: eventTimeFilterParam(f.time), od: f.from, do: f.to, mesto: f.city, zoradenie: f.sort }))
        if (value)
            p.set(key, value);
    return p;
}
// SQLite lower() is ASCII-only. Preserve the previous NFD/case folding in D1.
const foldSource = eventFoldSource.replaceAll("'", "''");
const foldTarget = eventFoldTarget.replaceAll("'", "''");
export function eventSearchSql(expression: string) {
    const char = 'substr(input, position, 1)';
    const code = `unicode(${char})`;
    const exceptional = eventOtherFolds.map(([key, value]) => `WHEN ${char} = '${key.replaceAll("'", "''")}' THEN '${value.replaceAll("'", "''")}'`).join(' ');
    const source = 'áäčďéíĺľňóôŕšťúýž';
    let fast = expression;
    for (const char of [...source, ...source.toUpperCase()])
        fast = `replace(${fast}, '${char}', '${normalizeEventSearch(char)}')`;
    const allowed = ' -~\n\r\t';
    const full = `(WITH RECURSIVE fold(input, position, result, source, target) AS (
 SELECT ${expression}, 1, '', '${foldSource}', '${foldTarget}' UNION ALL
 SELECT input, position + 1, result || CASE
 WHEN ${code} BETWEEN 768 AND 879 THEN ''
 WHEN ${code} BETWEEN 44032 AND 55203 THEN char(4352 + (${code} - 44032) / 588, 4449 + ((${code} - 44032) % 588) / 28) || CASE WHEN (${code} - 44032) % 28 = 0 THEN '' ELSE char(4519 + (${code} - 44032) % 28) END
 ${exceptional}
 WHEN instr(source, ${char}) > 0 THEN substr(target, instr(source, ${char}), 1)
 ELSE lower(${char}) END, source, target FROM fold WHERE position <= length(input)
 ) SELECT result FROM fold ORDER BY position DESC LIMIT 1)`;
    return `(CASE WHEN (${fast}) NOT GLOB '*[^${allowed}]*' THEN lower(${fast}) ELSE ${full} END)`;
}
function eventSearchFields(columns: string[]) {
    return `trim(${columns.map(column => `CASE WHEN COALESCE(${column}, '') <> '' THEN ${column} || ' ' ELSE '' END`).join(' || ')})`;
}
export function eventListingSql(f: EventListingFilters, today = bratislavaDateKey()) {
    const clauses = ["status = 'published'"], values: string[] = [];
    const add = (sql: string, ...args: string[]) => { clauses.push(sql); values.push(...args); };
    const end = "COALESCE(NULLIF(end_date, ''), start_date)";
    if (f.error)
        add('0 = 1');
    if (f.type !== 'Všetky')
        add('event_type = ?', f.type);
    if (f.region)
        add('region = ?', f.region);
    if (f.from)
        add(`${end} >= ?`, f.from);
    if (f.to)
        add('start_date <= ?', f.to);
    if (f.month) {
        const bounds = calendarMonthBounds(f.month);
        add(`start_date <= ? AND ${end} >= ?`, bounds.end, bounds.start);
    }
    if (f.time === 'upcoming')
        add(`${end} >= ?`, today);
    if (f.time === 'current')
        add(`start_date <= ? AND ${end} >= ?`, today, today);
    if (f.time === 'past')
        add(`${end} < ?`, today);
    if (f.city)
        add(`instr(${eventSearchSql(eventSearchFields(['city', 'venue', 'address']))}, ?) > 0`, normalizeEventSearch(f.city));
    if (f.query)
        add(`instr(${eventSearchSql(eventSearchFields(['title', 'excerpt', 'event_type', 'venue', 'address', 'city', 'region', 'organizer']))}, ?) > 0`, normalizeEventSearch(f.query));
    const asc = 'start_date ASC, start_time ASC, id ASC';
    const order = f.sort === 'najblizsie' ? asc : f.sort === 'najnovsie' ? 'start_date DESC, start_time DESC, id DESC' : `CASE WHEN ${end} < '${today}' THEN CASE WHEN cancelled = 1 THEN 4 ELSE 3 END WHEN cancelled = 1 THEN 2 WHEN start_date <= '${today}' THEN 0 ELSE 1 END, CASE WHEN ${end} < '${today}' THEN ${end} END DESC, CASE WHEN ${end} < '${today}' THEN start_time END DESC, CASE WHEN ${end} < '${today}' THEN id END DESC, ${asc}`;
    return { where: clauses.join(' AND '), values, order };
}
export function eventTypeSelectionRedirect(raw: Record<string, string | string[] | undefined>) {
    const type = Array.isArray(raw.typ) ? raw.typ[0] : raw.typ;
    if (!type)
        return null;
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
        const scalar = Array.isArray(value) ? value[0] : value;
        if (scalar && key !== 'typ' && key !== 'strana')
            p.set(key, scalar);
    }
    const path = (eventTypes as readonly string[]).includes(type) ? eventTypePortalHref(type as EventType) : '/podujatia';
    return path + (p.size ? '?' + p.toString() : '');
}
