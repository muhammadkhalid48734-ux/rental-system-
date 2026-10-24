import { useEffect, useState } from 'react';
import { fmtShortDate } from './dates.js';
import { dueInfo } from './schedule.js';

/** Re-renders when a CSS media query starts or stops matching. */
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Short step wording for queue rows. */
export function shortStage(stage, lead) {
  if (!stage) return lead.status === 'done' ? 'Finished' : lead.status;
  switch (stage.key) {
    case 'pitch': return 'New DM';
    case 'fu1': case 'fu2': case 'fu3': return `Follow-up ${stage.key.slice(2)} of 3`;
    case 'reply': return 'Reply';
    case 'replyWait': return 'Build demo';
    case 'demo': return 'Send demo';
    default: return `Demo nudge ${stage.key.slice(5)} of 3`;
  }
}

/** Due state of a lead for badges: { tone: 'bad' | 'warn' | 'plain', text } or null. */
export function dueBadge(lead, cfg, now = new Date()) {
  const due = dueInfo(lead, cfg, now);
  if (!due) return null;
  if (due.overdueDays > 0) return { tone: 'bad', text: `Overdue ${due.overdueDays}d` };
  if (due.overdueDays === 0) return { tone: 'warn', text: 'Due today' };
  return { tone: 'plain', text: `Due ${fmtShortDate(due.due)}` };
}
