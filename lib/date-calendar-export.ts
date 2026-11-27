/** RFC 5545 date-only events. Fold by UTF-8 octets, not JS code units. */
export type CalendarDateEvent = { uid: string; date: string; endDate?: string; summary: string; description?: string; reminder?: boolean; location?: string; url?: string; cancelled?: boolean; updatedAt?: string };
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
export function buildDateCalendar(events: readonly CalendarDateEvent[], now = new Date(), name?: string) {
  const stamp=now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Psipedia.sk//Calendar//SK","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  if(name) lines.push("X-WR-CALNAME:"+escapeCalendarText(name));
  for(const e of events) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(e.uid) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const day = new Date(e.date+"T00:00:00Z");
    if(!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==e.date) continue;
    if(e.endDate && /^\d{4}-\d{2}-\d{2}$/.test(e.endDate) && e.endDate>=e.date) {
      const end = new Date(e.endDate+"T00:00:00Z");
      if(Number.isFinite(end.getTime()) && end.toISOString().slice(0,10)===e.endDate) day.setTime(end.getTime());
    }
    day.setUTCDate(day.getUTCDate()+1);
    const modified = e.updatedAt ? new Date(e.updatedAt) : null;
    const eventStamp = modified && Number.isFinite(modified.getTime()) ? modified.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z") : stamp;
    lines.push("BEGIN:VEVENT","UID:"+e.uid+"@psipedia.sk","DTSTAMP:"+eventStamp,"DTSTART;VALUE=DATE:"+e.date.replace(/-/g,""),"DTEND;VALUE=DATE:"+day.toISOString().slice(0,10).replace(/-/g,""),"SUMMARY:"+escapeCalendarText(e.summary));
    if(e.description) lines.push("DESCRIPTION:"+escapeCalendarText(e.description));
    if(e.location) lines.push("LOCATION:"+escapeCalendarText(e.location));
    if(e.url && /^https:\/\/psipedia\.sk\/[A-Za-z0-9%/_-]+$/.test(e.url)) lines.push("URL:"+e.url);
    if(e.cancelled) lines.push("STATUS:CANCELLED");
    if(modified && Number.isFinite(modified.getTime())) lines.push("LAST-MODIFIED:"+eventStamp);
    if(e.reminder) lines.push("BEGIN:VALARM","TRIGGER:-P1D","ACTION:DISPLAY","DESCRIPTION:"+escapeCalendarText(e.summary),"END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return lines.map(foldCalendarLine).join("\r\n")+"\r\n";
}
