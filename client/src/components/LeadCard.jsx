import { useEffect, useRef, useState } from 'react';
import { copyText, drafts } from '../lib/clipboard.js';
import { fmtShortDate } from '../lib/dates.js';
import { buildMessage, getStage, hasLink, hasPlaceholder, PROBLEMS, toEmailText } from '../lib/messages.js';
import { dueInfo } from '../lib/schedule.js';

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>More ▾</button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              onClick={() => { setOpen(false); it.run(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadCard({ lead, env, defaultAccount }) {
  const { cfg, busy, newBy, actions } = env;

  // The demo link is typed into the card; the message switches as soon as a valid link is present.
  const [linkDraft, setLinkDraft] = useState(lead.demoLink || '');
  useEffect(() => { setLinkDraft(lead.demoLink || ''); }, [lead.demoLink]);
  const eff = lead.status === 'replied' ? { ...lead, demoLink: linkDraft.trim() } : lead;

  // Optimistic copy of the "confirmed" checkbox; reset to the Sheet's value after every reload.
  const [verified, setVerified] = useState(lead.verified);
  useEffect(() => { setVerified(lead.verified); }, [lead]);

  const stage = getStage(eff);
  const showMessage = !!stage && stage.sendable;
  const due = dueInfo(lead, cfg);

  const isNew = stage?.isNew;
  const account = lead.account || (isNew ? defaultAccount : '') || 'A';

  const avail = [lead.ig && 'ig', lead.fb && 'fb', lead.email && 'email'].filter(Boolean);
  const [channel, setChannel] = useState(avail[0] || 'ig');

  // Edits to the message survive reloads and tab switches until the message is sent.
  const dkey = stage ? `${lead.id}:${stage.key}${stage.key === 'demo' ? `:${eff.demoLink}` : ''}` : null;
  const generated = showMessage ? buildMessage(stage, eff, cfg) : '';
  const [draft, setDraft] = useState(() => (dkey ? drafts.get(dkey) : null));
  const lastKey = useRef(dkey);
  if (lastKey.current !== dkey) {
    lastKey.current = dkey;
    setDraft(dkey ? drafts.get(dkey) : null);
  }
  const text = draft ?? generated;
  const edited = draft !== null && draft !== generated;

  const onType = (v) => {
    setDraft(v);
    drafts.set(dkey, v);
  };
  const resetText = () => {
    setDraft(null);
    drafts.clear(dkey);
  };

  const needsCheck = lead.problem === 'down' || lead.problem === 'parked';
  const blockedByCheck = needsCheck && !verified && stage?.key === 'pitch';
  const atLimit = isNew && newBy[account] >= cfg.cap;
  const blocked = blockedByCheck
    ? 'Tick "I opened it and confirmed the problem" before marking this sent.'
    : atLimit
      ? `Account ${account} has reached its daily limit of ${cfg.cap} new DMs. Switch to the other account.`
      : '';

  const send = (ch) => {
    if (blocked) {
      actions.toast(blocked, { kind: 'warn', ms: 5000 });
      return;
    }
    actions.send(lead, stage, account, ch, eff.demoLink);
  };

  const copy = () => {
    copyText(text).then((ok) => actions.toast(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy manually.', ok ? {} : { kind: 'bad' }));
  };
  const copyOpen = (ch) => () => {
    // Runs inside the <a> click, so the copy happens in the same user gesture that opens the tab.
    setChannel(ch);
    copyText(text).then((ok) => {
      if (!ok) actions.toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
    });
    if (cfg.autoMark) send(ch);
    else actions.toast(`Copied. Paste it into ${ch === 'ig' ? 'Instagram' : 'Facebook'}, send it, then press Mark sent.`);
  };
  const copyEmail = () => {
    setChannel('email');
    copyText(toEmailText(stage, eff, cfg, text)).then((ok) => {
      if (!ok) return actions.toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
      if (!String(cfg.address || '').trim()) {
        return actions.toast('Copied, but your postal address is empty. Add it in Settings before sending marketing email.', { kind: 'warn', ms: 6000 });
      }
      return actions.toast('Copied as email');
    });
  };

  const saveLink = () => {
    const v = linkDraft.trim();
    if (v === (lead.demoLink || '')) return;
    if (v && !hasLink(v)) {
      actions.toast('The demo link must start with http:// or https://', { kind: 'warn' });
      return;
    }
    actions.patch(lead.id, { demoLink: v }, undefined, { quiet: true });
  };

  const menuItems = [];
  if (!['replied', 'won'].includes(lead.status)) {
    menuItems.push({ label: 'They replied', run: () => actions.patch(lead.id, { status: 'replied', repliedAt: new Date().toISOString() }, 'Moved to replies') });
  }
  if (lead.status !== 'won') menuItems.push({ label: 'Won', run: () => actions.patch(lead.id, { status: 'won' }, 'Marked won') });
  if (lead.status !== 'lost') menuItems.push({ label: 'Not interested', run: () => actions.patch(lead.id, { status: 'lost' }, 'Marked not interested') });
  menuItems.push({ label: 'Edit lead', run: () => actions.edit(lead) });

  const dueBadge = due
    ? due.overdueDays > 0
      ? <span className="badge bad">{due.overdueDays}d overdue</span>
      : due.overdueDays === 0
        ? <span className="badge warn">Due today</span>
        : <span className="badge">Due {fmtShortDate(due.due)}</span>
    : null;

  const accName = account === 'A' ? cfg.accA : cfg.accB;
  const sub = [lead.city, lead.owner].filter(Boolean).join(' · ');

  return (
    <article className={`card ${lead.status === 'replied' ? 'replied' : ''}`} aria-label={lead.name}>
      <div className="card-head">
        <div>
          <h3 className="biz">{lead.name}</h3>
          {sub && <div className="sub">{sub}</div>}
          <div className="step">
            {stage ? stage.label : `Status: ${lead.status}`}
            {lead.step > 0 && lead.status === 'active' ? ` · ${lead.step}/4 sent` : ''}
          </div>
        </div>
        <div className="badges">
          <span className={`badge prob-${lead.problem}`}>{PROBLEMS[lead.problem] || lead.problem}</span>
          {(lead.account || isNew) && <span className={`badge acc-${account}`}>{account}{accName ? ` · ${accName}` : ''}</span>}
          {dueBadge}
          {needsCheck && !verified && <span className="badge warn">⚠ Unverified</span>}
          {lead.status === 'replied' && <span className="badge ok">Replied</span>}
        </div>
      </div>

      {needsCheck && (
        <div className={`verify ${verified ? '' : 'unverified'}`}>
          <label className="check">
            <input
              type="checkbox"
              checked={verified}
              disabled={busy}
              onChange={(e) => {
                setVerified(e.target.checked);
                actions.patch(lead.id, { verified: e.target.checked });
              }}
            />
            <span>I opened it and confirmed the problem</span>
          </label>
          {lead.site
            ? <a className="btn small" href={lead.site} target="_blank" rel="noopener noreferrer" style={{ justifySelf: 'start' }}>Open site ↗</a>
            : <span className="hint">No site address saved. Add one with Edit lead.</span>}
        </div>
      )}

      {lead.status === 'replied' && (
        <label className="field">
          <span>Demo link (paste it here to switch to the demo-delivery message)</span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onBlur={saveLink}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </label>
      )}

      {stage?.key === 'replyWait' && (
        <div className="notice">Photo-permission message sent. Once they agree, build the private demo and paste its link above to get the delivery message.</div>
      )}

      {isNew && (
        <div className="actions">
          <span className="label">Send from</span>
          <div className="toggle" role="group" aria-label="Account">
            {['A', 'B'].map((a) => (
              <button
                key={a}
                className={a.toLowerCase()}
                aria-pressed={account === a}
                disabled={busy}
                onClick={() => account !== a && actions.patch(lead.id, { account: a })}
              >
                {a} <span className="mono" style={{ fontWeight: 400 }}>{newBy[a]}/{cfg.cap}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showMessage && (
        <>
          <label className="field">
            <span className="sr-only">Message to {lead.name}</span>
            <textarea
              className="msg"
              aria-label={`Message to ${lead.name}`}
              value={text}
              rows={Math.min(16, Math.max(7, Math.ceil(text.length / 52) + 2))}
              onChange={(e) => onType(e.target.value)}
              spellCheck
            />
          </label>
          {edited && (
            <div className="actions">
              <span className="hint">Your edits are kept until you mark it sent.</span>
              <button className="btn small ghost" onClick={resetText}>Reset text</button>
            </div>
          )}
          {hasPlaceholder(text) && (
            <p className="hint warn">The message still contains [placeholder] text. Fix it above or in Settings before sending.</p>
          )}

          <div className="actions">
            {lead.ig && (
              <a className="btn primary" href={lead.ig} target="_blank" rel="noopener noreferrer" onClick={copyOpen('ig')}>
                Copy + open Instagram
              </a>
            )}
            {lead.fb && (
              <a className="btn primary" href={lead.fb} target="_blank" rel="noopener noreferrer" onClick={copyOpen('fb')}>
                Copy + open Facebook
              </a>
            )}
            <button className="btn" onClick={copy}>Copy</button>
            <button className="btn" onClick={copyEmail}>Copy as email</button>
          </div>
          {lead.email && <div className="hint">Email: <span className="mono">{lead.email}</span></div>}

          <div className="actions">
            <button className="btn ok" disabled={!!blocked || busy} onClick={() => send(channel)}>Mark sent</button>
            <label className="actions" style={{ gap: 6 }}>
              <span className="hint">via</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel used" style={{ width: 'auto', minHeight: 38 }}>
                <option value="ig">Instagram</option>
                <option value="fb">Facebook</option>
                <option value="email">Email</option>
              </select>
            </label>
            <span className="grow" />
            <MoreMenu items={menuItems} />
          </div>
          {blocked && <p className="hint warn">{blocked}</p>}
        </>
      )}

      {!showMessage && (
        <div className="actions">
          {!stage && lead.status === 'done' && <span className="hint">All 4 messages sent. Nothing more is scheduled.</span>}
          <span className="grow" />
          <MoreMenu items={menuItems} />
        </div>
      )}
    </article>
  );
}
