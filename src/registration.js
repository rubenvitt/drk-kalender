// Registration ("Anmeldung") is not decided yet. Everything about it lives in this
// one function so the decision only has to be implemented here. Per calendar, the
// config can choose one of:
//   { "type": "event-url" }            URL property of the event, else a line
//                                       "Anmeldung: https://…" in the description
//   { "type": "url", "url": "https://…?termin={id}" }
//   { "type": "mailto", "to": "…", "subject": "Anmeldung: {title} am {date}" }
// Optional "label" sets the button text. Without "registration" there is no button.

import { safeHttpUrl } from './text.js';

export const REGISTRATION_TYPES = ['event-url', 'url', 'mailto'];
const DEFAULT_LABEL = 'Zur Anmeldung';

const fill = (template, vars, encode = (s) => s) =>
  template.replace(/\{(title|date|id|uid)\}/g, (m, k) => encode(String(vars[k] ?? '')));

function urlFromDescription(description) {
  const m = description?.match(/^\s*Anmeldung\s*:\s*(https?:\/\/\S+)/im);
  return m ? safeHttpUrl(m[1]) : null;
}

/** @returns {{href: string, label: string} | null} */
export function registrationFor(rule, event) {
  if (!rule) return null;
  const vars = { title: event.title, date: event.dateShort, id: event.id, uid: event.uid };
  let href = null;
  if (rule.type === 'event-url') href = event.url || urlFromDescription(event.description);
  else if (rule.type === 'url') href = safeHttpUrl(fill(rule.url, vars, encodeURIComponent));
  else if (rule.type === 'mailto') {
    const subject = fill(rule.subject || 'Anmeldung: {title} am {date}', vars);
    href = `mailto:${encodeURIComponent(rule.to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}`;
  }
  return href ? { href, label: rule.label || DEFAULT_LABEL } : null;
}
