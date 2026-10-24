import { useEffect, useRef, useSyncExternalStore } from 'react';
import { fmtTime } from '../lib/dates.js';
import { batch } from '../lib/batch.js';
import { buildMessage, getStage, PROBLEMS } from '../lib/messages.js';
import { dueBadge, shortStage } from '../lib/ui.js';
import { I, Icon } from './icons.jsx';
import LeadCard from './LeadCard.jsx';

const CHANNEL = { ig: 'Instagram', fb: 'Facebook', email: 'Email' };

function GenerateAll({ items, env }) {
  const b = useSyncExternalStore(batch.subscribe, batch.getSnapshot, batch.getSnapshot);
  const off = !env.llm.configured;
  return (
    <div className="queue-top">
      {!b.running && (
        <button className="btn btn-secondary btn-sm" disabled={off || items.length === 0} onClick={() => batch.start(items)}>
          <Icon as={I.Sparkle} /> Generate all for today
        </button>
      )}
      {off && <p className="inline-note"><Icon as={I.Info} /><span>AI personalization is off. Settings explains how to turn it on.</span></p>}
      {!off && !b.running && !b.summary && (
        <p className="hint">Writes one draft at a time. Messages you edited are skipped.</p>
      )}
      {b.running && (
        <div className="batch" role="status" aria-live="polite">
          <div className="batch-row">
            <b className="num">{Math.min(b.done + 1, b.total)} of {b.total}</b>
            <span className="hint">{b.waitMs > 0 ? `Pausing ${Math.ceil(b.waitMs / 1000)}s to stay under the rate limit` : `Writing for ${b.current}`}</span>
          </div>
          <progress max={b.total || 1} value={b.done} aria-label="Generation progress" />
          <button className="btn btn-secondary btn-sm" onClick={batch.cancel}>Cancel</button>
        </div>
      )}
      {!b.running && b.summary && (
        <div className="notice" role="status">
          <Icon as={I.Info} />
          <div>
            <p>{b.summary}</p>
            <button className="btn btn-quiet btn-sm" onClick={batch.dismiss}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueRow({ lead, account, cfg, selected, onSelect }) {
  const stage = getStage(lead);
  const due = dueBadge(lead, cfg);
  const acct = lead.account || account || '';
  return (
    <li>
      <button className="queue-row" aria-current={selected ? 'true' : undefined} data-lead-id={lead.id} onClick={() => onSelect(lead.id)}>
        <span className="qr-line">
          <span className="qr-name">{lead.name}</span>
          {acct && <span className={`acct ${acct === 'B' ? 'acct-B' : ''}`} title={`Account ${acct}`}><span aria-hidden="true">{acct}</span><span className="sr-only">Account {acct}</span></span>}
        </span>
        <span className="qr-meta">
          <span className={`tag tag-${lead.problem}`}>{PROBLEMS[lead.problem] || lead.problem}</span>
          <span className="step">{shortStage(stage, lead)}</span>
          {due && <span className={`tag ${due.tone === 'bad' ? 'tag-bad' : due.tone === 'warn' ? 'tag-warn' : ''}`}>{due.text}</span>}
        </span>
      </button>
    </li>
  );
}

function Group({ id, title, count, hot, empty, children }) {
  return (
    <section className="queue-group" aria-labelledby={`g-${id}`}>
      <h2 className="queue-group-head" id={`g-${id}`}>
        {title} <span className={`count ${hot && count > 0 ? 'count-hot' : ''}`}>{count}<span className="sr-only"> in this group</span></span>
      </h2>
      {count === 0 ? <p className="queue-empty">{empty}</p> : <ul className="queue-list">{children}</ul>}
    </section>
  );
}

function EmptyState({ kind, env, onAdd, onImport, goTab }) {
  const { cfg } = env;
  if (kind === 'none') {
    return (
      <div className="empty-state">
        <span className="icon-wrap"><Icon as={I.Tray} size="xl" /></span>
        <h2>No leads yet</h2>
        <p>Add a lead by hand, or paste rows from your spreadsheet to build today's queue.</p>
        <div className="row-flex" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onAdd}><Icon as={I.Plus} /> Add a lead</button>
          <button className="btn btn-secondary" onClick={onImport}><Icon as={I.UploadSimple} /> Import rows</button>
        </div>
      </div>
    );
  }
  if (kind === 'limit') {
    return (
      <div className="empty-state is-limit">
        <span className="icon-wrap"><Icon as={I.ClockCountdown} size="xl" /></span>
        <h2>Daily limit reached</h2>
        <p>
          Both accounts have reached today's limit of {cfg.cap} new DM{cfg.cap === 1 ? '' : 's'}. New DMs unlock tomorrow. Follow-ups and replies show up here
          when they are due, and they also count toward each account's daily volume.
        </p>
        <button className="btn btn-primary" onClick={() => goTab('leads')}><Icon as={I.Users} /> Review your leads</button>
      </div>
    );
  }
  if (kind === 'done') {
    return (
      <div className="empty-state">
        <span className="icon-wrap"><Icon as={I.CheckCircle} size="xl" /></span>
        <h2>Nothing left for today</h2>
        <p>Every reply, follow-up and new DM in your queue is handled. Add or import more leads when you want to keep going.</p>
        <button className="btn btn-primary" onClick={() => goTab('leads')}><Icon as={I.Users} /> Open Leads</button>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <span className="icon-wrap"><Icon as={I.ListChecks} size="xl" /></span>
      <h2>Pick a lead</h2>
      <p>Choose a lead from the queue to see its message. Use the up and down arrow keys to move through the queue.</p>
    </div>
  );
}

export default function Today({ today, env, leadCount, selectedId, onSelect, onBack, isWide, onAdd, onImport, goTab }) {
  const { cfg } = env;
  const { replies, followups, newDMs, sentToday, remaining, queuedTotal } = today;
  const limitHit = remaining.A + remaining.B === 0;
  const later = queuedTotal - newDMs.length;

  const everyone = [
    ...replies.map((lead) => ({ lead, account: '' })),
    ...followups.map((x) => ({ lead: x.lead, account: '' })),
    ...newDMs.map((x) => ({ lead: x.lead, account: x.account })),
  ];
  const selected = everyone.find((x) => x.lead.id === selectedId) || null;

  const items = everyone
    .map(({ lead }) => ({ lead, stage: getStage(lead) }))
    .filter((it) => it.stage?.sendable)
    .map((it) => ({ ...it, template: buildMessage(it.stage, it.lead, cfg) }));

  // Keep the selected row in view, and move focus sensibly when a phone switches between list and detail.
  const listRef = useRef(null);
  const detailRef = useRef(null);
  const lastSelected = useRef(null);
  const firstRun = useRef(true);
  // Scroll the queue pane by hand, and only when the row is out of view: scrollIntoView would also move the browser's
  // keyboard starting point, so the first Tab after load would skip the skip link and the header.
  useEffect(() => {
    if (!selectedId || !isWide) return;
    const pane = listRef.current;
    const row = pane?.querySelector(`[data-lead-id="${CSS.escape(selectedId)}"]`);
    if (!pane || !row) return;
    const p = pane.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < p.top) pane.scrollTop -= p.top - r.top + 8;
    else if (r.bottom > p.bottom) pane.scrollTop += r.bottom - p.bottom + 8;
  }, [selectedId, isWide]);
  useEffect(() => {
    if (isWide) return;
    const initial = firstRun.current; // a fresh page load must keep the browser's own starting point (skip link first)
    firstRun.current = false;
    if (selectedId) {
      lastSelected.current = selectedId;
      if (!initial) detailRef.current?.focus({ preventScroll: true });
    } else if (lastSelected.current) {
      const id = lastSelected.current;
      lastSelected.current = null;
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-lead-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
    }
  }, [selectedId, isWide]);

  const emptyKind = leadCount === 0 ? 'none' : everyone.length === 0 ? (limitHit ? 'limit' : 'done') : 'pick';

  const queue = (
    <aside className="queue-pane" aria-label="Today's queue" ref={listRef}>
      <GenerateAll items={items} env={env} />
      <Group id="replies" title="Replies" count={replies.length} hot empty="No replies waiting.">
        {replies.map((lead) => <QueueRow key={lead.id} lead={lead} cfg={cfg} selected={lead.id === selectedId} onSelect={onSelect} />)}
      </Group>
      <Group id="followups" title="Follow-ups due" count={followups.length} empty="No follow-ups due today.">
        {followups.map(({ lead }) => <QueueRow key={lead.id} lead={lead} cfg={cfg} selected={lead.id === selectedId} onSelect={onSelect} />)}
      </Group>
      <Group id="new" title="New DMs" count={newDMs.length} empty={limitHit ? `Daily limit reached (${cfg.cap} per account).` : leadCount === 0 ? 'No leads yet.' : 'No queued leads left.'}>
        {newDMs.map(({ lead, account }) => <QueueRow key={lead.id} lead={lead} account={account} cfg={cfg} selected={lead.id === selectedId} onSelect={onSelect} />)}
        {later > 0 && <li className="queue-empty" style={{ padding: 'var(--s-2) var(--s-3)' }}>{later} more queued, waiting for open daily slots.</li>}
      </Group>
      <details className="queue-group" open>
        <summary>
          <span>Sent today</span> <span className="count">{sentToday.length}</span>
        </summary>
        {sentToday.length === 0 ? (
          <p className="queue-empty">Nothing sent yet today.</p>
        ) : (
          <ul className="queue-list">
            {sentToday.map((r, i) => {
              const label = r.track === 'reply' ? 'Reply' : r.track === 'demo' ? (r.step === 0 ? 'Demo' : `Demo nudge ${r.step}`) : r.step === 0 ? 'Pitch' : `Follow-up ${r.step}`;
              return (
                <li className="sent-row" key={`${r.leadId}-${r.timestamp}-${i}`}>
                  <Icon as={I.CheckCircle} className="muted" />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{r.lead?.name || 'Deleted lead'}</div>
                    <div className="sub">{label} · {CHANNEL[r.channel] || r.channel}</div>
                  </div>
                  <span className={`acct ${r.account === 'B' ? 'acct-B' : ''}`}><span aria-hidden="true">{r.account}</span><span className="sr-only">Account {r.account}</span></span>
                  <span className="time num">{fmtTime(new Date(r.timestamp))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </details>
      <p className="queue-empty" role="note" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
        Follow-ups and replies also count toward each account's daily volume. This app never sends anything: it copies the message, opens the profile and records what you send.
      </p>
    </aside>
  );

  const detail = selected ? (
    <LeadCard key={selected.lead.id} lead={selected.lead} env={env} defaultAccount={selected.account} active />
  ) : (
    <EmptyState kind={emptyKind} env={env} onAdd={onAdd} onImport={onImport} goTab={goTab} />
  );

  if (isWide) {
    return (
      <div className="workbench">
        {queue}
        <section className="detail-pane" aria-label="Selected lead">{detail}</section>
      </div>
    );
  }

  if (selectedId && selected) {
    return (
      <div className="detail-view" ref={detailRef} tabIndex={-1}>
        <div className="back-row">
          <button className="btn btn-secondary" onClick={onBack}><Icon as={I.ArrowLeft} /> Back to queue</button>
        </div>
        {detail}
      </div>
    );
  }

  return (
    <div className="stack">
      {everyone.length === 0 && <EmptyState kind={emptyKind} env={env} onAdd={onAdd} onImport={onImport} goTab={goTab} />}
      {queue}
    </div>
  );
}
