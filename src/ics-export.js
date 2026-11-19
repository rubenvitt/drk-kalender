// Single-event .ics files for the "In meinen Kalender" button.

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 75 octets without splitting UTF-8 characters (RFC 5545, 3.1). */
export function fold(line) {
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch);
    if (len + bytes > 75) {
      out.push(cur);
      cur = ' ';
      len = 1;
    }
    cur += ch;
    len += bytes;
  }
  out.push(cur);
  return out.join('\r\n');
}

const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateValue = (key) => key.replace(/-/g, '');
const nextDay = (key) => new Date(Date.parse(key + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

export function eventToIcs(ev, { now, prodId = '-//DRK Kalender//DE' }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${ev.id}@drk-kalender`, `DTSTAMP:${utc(now)}`];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(ev.startDate)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(ev.endDate))}`);
  } else {
    lines.push(`DTSTART:${utc(Date.parse(ev.start))}`, `DTEND:${utc(Date.parse(ev.end))}`);
  }
  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.registration?.href?.startsWith('http')) lines.push(`URL:${ev.registration.href}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
