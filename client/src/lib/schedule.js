import { addDays, daysBetween, fmtShortDate, isSameDay, startOfDay, ymd } from './dates.js';
import { getStage, PROBLEM_PRIORITY } from './messages.js';

export function parseConfig(c) {
  const cap = Math.max(1, parseInt(c.cap, 10) || 10);
  let gaps = String(c.gaps || '2,3,4').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
  if (gaps.length < 3) gaps = [2, 3, 4];
  return { ...c, cap, gaps };
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
  // Rows backfilled by an import describe messages sent before the app was used. They stay in the Log as
  // history but never count toward today's meters, the sent list, the progress ring or the streak.
  const sorted = log.filter((r) => r.channel !== 'imported').sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
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

  // Everything still to do today vs. already sent: drives the progress ring.
  const todo = {
    replies: replies.filter((l) => getStage(l)?.sendable).length,
    followups: followups.length,
    newDMs: newDMs.length,
  };
  const left = todo.replies + todo.followups + todo.newDMs;
  const sent = today.length;
  const goal = sent + left;
  // Header progress: new DMs plus follow-ups only. Replies (and the demo delivery that answers one) have their own
  // queue group and are not counted as tasks.
  const taskSends = today.filter((r) => r.track === 'cold' || (r.track === 'demo' && r.step > 0)).length;
  const tasks = { done: taskSends, left: followups.length + newDMs.length };
  tasks.total = tasks.done + tasks.left;

  const progress = {
    tasks,
    sent, left, goal, todo,
    pct: goal ? Math.round((sent / goal) * 100) : 0,
    complete: sent > 0 && left === 0,
  };

  return {
    replies, followups, newDMs, sentToday, remaining, progress,
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

/** Streak (consecutive days with a send; an empty today doesn't break it yet) and 7-day totals. */
export function weekStats(leads, log, now = new Date()) {
  const sends = netSends(log);
  const days = new Set(sends.map((r) => ymd(new Date(r.timestamp))));
  let streak = 0;
  let d = new Date(now);
  if (!days.has(ymd(d))) d = addDays(d, -1);
  while (days.has(ymd(d))) {
    streak++;
    d = addDays(d, -1);
  }
  const weekStart = addDays(startOfDay(now), -6);
  return {
    streak,
    sent: sends.filter((r) => new Date(r.timestamp) >= weekStart).length,
    replies: leads.filter((l) => l.repliedAt && new Date(l.repliedAt) >= weekStart).length,
    won: leads.filter((l) => l.status === 'won').length,
  };
}

/** What happens next for a lead (used by the import preview). `p` needs status, step, lastSentAt. */
export function nextAction(p, cfg, now = new Date()) {
  switch (p.status) {
    case 'queued':
      return { kind: 'new', text: 'New DM, ready today (subject to the daily limit)' };
    case 'replied':
      return { kind: 'reply', text: 'Reply is due now' };
    case 'active': {
      const d = dueInfo({ status: 'active', step: p.step, lastSentAt: p.lastSentAt }, cfg, now);
      if (!d) return { kind: 'none', text: 'No follow-up scheduled' };
      const label = `Follow-up ${p.step}`;
      const when = fmtShortDate(d.due);
      const text = d.overdueDays > 0
        ? `${label} overdue by ${d.overdueDays} day${d.overdueDays === 1 ? '' : 's'} (was due ${when})`
        : d.overdueDays === 0
          ? `${label} due today`
          : `${label} due ${when} (in ${-d.overdueDays} day${d.overdueDays === -1 ? '' : 's'})`;
      return { kind: 'followup', due: d.due, overdueDays: d.overdueDays, text };
    }
    case 'done':
      return { kind: 'none', text: 'Sequence finished' };
    default:
      return { kind: 'none', text: 'Nothing scheduled' };
  }
}
