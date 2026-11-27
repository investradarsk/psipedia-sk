/** RFC 5545 date-only events. Fold by UTF-8 octets, not JS code units. */
export type CalendarDateEvent = { uid: string; date: string; summary: string; description?: string; reminder?: boolean };
export function escapeCalendarText(value: string) {
  return value.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"");
}
export function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let part="", bytes=0; const lines:string[]=[];
  for (const ch of line) {
    const size=encoder.encode(ch).length;
    if (bytes+size>75) { lines.push(part); part=" "; bytes=1; }
    part+=ch; bytes+=size;
  }
  lines.push(part); return lines.join("\r\n");
}
export function buildDateCalendar(events: readonly CalendarDateEvent[], now = new Date()) {
  const stamp=now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Psipedia.sk//Calendar//SK","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  for(const e of events) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(e.uid) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const day = new Date(e.date+"T00:00:00Z");
    if(!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==e.date) continue;
    day.setUTCDate(day.getUTCDate()+1);
    lines.push("BEGIN:VEVENT","UID:"+e.uid+"@psipedia.sk","DTSTAMP:"+stamp,"DTSTART;VALUE=DATE:"+e.date.replace(/-/g,""),"DTEND;VALUE=DATE:"+day.toISOString().slice(0,10).replace(/-/g,""),"SUMMARY:"+escapeCalendarText(e.summary));
    if(e.description) lines.push("DESCRIPTION:"+escapeCalendarText(e.description));
    if(e.reminder) lines.push("BEGIN:VALARM","TRIGGER:-P1D","ACTION:DISPLAY","DESCRIPTION:"+escapeCalendarText(e.summary),"END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return lines.map(foldCalendarLine).join("\r\n")+"\r\n";
}
