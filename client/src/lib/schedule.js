import { addDays, daysBetween, isSameDay, startOfDay } from './dates.js';
import { PROBLEM_PRIORITY } from './messages.js';

export function parseConfig(c) {
  const cap = Math.max(1, parseInt(c.cap, 10) || 10);
  let gaps = String(c.gaps || '2,3,4').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
  if (gaps.length < 3) gaps = [2, 3, 4];
  return { ...c, cap, gaps, autoMark: String(c.autoMark) === 'true' };
}

/** When the next message is due for an active lead (day granularity), else null. */
export function dueInfo(lead, cfg, now = new Date()) {
  if (lead.status !== 'active' || !lead.lastSentAt) return null;
  const gap = cfg.gaps[lead.step - 1];
  if (!gap) return null;
  const due = addDays(startOfDay(new Date(lead.lastSentAt)), gap);
  const overdueDays = daysBetween(due, now);
  return { due, overdueDays, isDue: overdueDays >= 0 };
}

/**
 * Log rows with undo rows cancelling the most recent matching send, so an undone
 * "Mark sent" frees its daily slot.
 */
export function netSends(log) {
  const sorted = [...log].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const out = [];
  for (const r of sorted) {
    if (r.channel === 'undo') {
      for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i];
        if (o.leadId === r.leadId && o.track === r.track && o.step === r.step) {
          out.splice(i, 1);
          break;
        }
      }
    } else {
      out.push(r);
    }
  }
  return out;
}

const isNewSend = (r) => r.track === 'cold' && r.step === 0;

export function sentCounts(log, now = new Date()) {
  const today = netSends(log).filter((r) => isSameDay(new Date(r.timestamp), now));
  const newBy = { A: 0, B: 0 };
  for (const r of today) if (isNewSend(r) && r.account in newBy) newBy[r.account]++;
  return { today, newBy, followupsSent: today.filter((r) => !isNewSend(r)).length };
}

/** Builds everything the Today screen and header meters need. */
export function buildToday(leads, log, cfg, now = new Date()) {
  const { today, newBy, followupsSent } = sentCounts(log, now);
  const cap = cfg.cap;

  const replies = leads
    .filter((l) => l.status === 'replied')
    .sort((a, b) => String(a.repliedAt).localeCompare(String(b.repliedAt)));

  const followups = leads
    .map((lead) => ({ lead, due: dueInfo(lead, cfg, now) }))
    .filter((x) => x.due?.isDue)
    .sort((a, b) => a.due.due - b.due.due);

  const remaining = { A: Math.max(0, cap - newBy.A), B: Math.max(0, cap - newBy.B) };
  const queued = leads
    .filter((l) => l.status === 'queued')
    .sort((a, b) => (PROBLEM_PRIORITY[a.problem] ?? 9) - (PROBLEM_PRIORITY[b.problem] ?? 9) || a.order - b.order);
  const picked = queued.slice(0, remaining.A + remaining.B);

  // Default A/B split: explicit picks stay, the rest fill A's open slots first, then B's.
  let freeA = remaining.A - picked.filter((l) => l.account === 'A').length;
  let freeB = remaining.B - picked.filter((l) => l.account === 'B').length;
  const newDMs = picked.map((lead) => {
    if (lead.account === 'A' || lead.account === 'B') return { lead, account: lead.account, explicit: true };
    if (freeA > 0) { freeA--; return { lead, account: 'A', explicit: false }; }
    freeB--;
    return { lead, account: 'B', explicit: false };
  });

  const byId = new Map(leads.map((l) => [l.id, l]));
  const sentToday = today
    .map((r) => ({ ...r, lead: byId.get(r.leadId) }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  return {
    replies, followups, newDMs, sentToday, remaining,
    queuedTotal: queued.length,
    meters: {
      A: { used: newBy.A, cap },
      B: { used: newBy.B, cap },
      followups: { sent: followupsSent, total: followupsSent + followups.length },
    },
  };
}

export function pipelineStats(leads) {
  const contacted = leads.filter((l) => l.step > 0 || l.lastSentAt || ['active', 'replied', 'won', 'done'].includes(l.status)).length;
  const replied = leads.filter((l) => l.repliedAt || ['replied', 'won'].includes(l.status)).length;
  const won = leads.filter((l) => l.status === 'won').length;
  const rate = contacted ? Math.round((replied / contacted) * 100) : 0;
  return { leads: leads.length, contacted, replied, rate, won };
}
