import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { copyText } from '../lib/clipboard.js';
import { EMPTY, genCache } from '../lib/genCache.js';
import { cacheKey, errorMessage, goTo, requestVariant, stashEdit, view } from '../lib/gen.js';
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

  // Versions, the version on screen, and unsent edits live in the generation cache (per lead + step),
  // so they survive reloads and tab switches until the message is sent.
  const gkey = stage ? cacheKey(eff, stage) : null;
  const entry = useSyncExternalStore(genCache.subscribe, () => (gkey ? genCache.get(gkey) : EMPTY), () => EMPTY);
  const template = showMessage ? buildMessage(stage, eff, cfg) : '';
  const v = view(entry, template);
  const text = v.text;
  const edited = v.edited;

  const onType = (val) => genCache.update(gkey, (c) => ({ ...c, draft: val }));
  const resetText = () => genCache.update(gkey, (c) => ({ ...c, draft: null }));

  // Brief "Copied ✓" feedback on the button that was pressed.
  const [flashKey, setFlashKey] = useState(null);
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flash = (k) => {
    setFlashKey(k);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 1600);
  };

  // Regenerate / version navigation. Replacing edited text always needs an in-page confirmation.
  const [hint, setHint] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { setConfirm(null); }, [gkey]);

  const runRegenerate = async () => {
    setConfirm(null);
    stashEdit(gkey, template);
    setGenerating(true);
    try {
      const res = await requestVariant({ lead: eff, stage, hint: hint.trim(), template });
      if (res.source === 'template') {
        actions.toast('The AI draft did not pass the safety checks, so the template is shown. Try Regenerate again.', { kind: 'warn', ms: 6000 });
      }
    } catch (err) {
      actions.toast(errorMessage(err), { kind: 'bad', ms: 6000 });
    } finally {
      setGenerating(false);
    }
  };
  const onRegenerate = () => (edited ? setConfirm({ type: 'regen' }) : runRegenerate());
  const onGoto = (target) => (edited ? setConfirm({ type: 'goto', target }) : goTo(gkey, template, target));
  const confirmReplace = () => {
    if (confirm.type === 'regen') {
      runRegenerate();
    } else {
      stashEdit(gkey, template);
      goTo(gkey, template, confirm.target);
      setConfirm(null);
    }
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
    actions.send(lead, stage, account, ch, eff.demoLink, text);
  };

  const copy = () => {
    copyText(text).then((ok) => {
      if (ok) flash('copy');
      else actions.toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
    });
  };
  const copyOpen = (ch) => () => {
    // Runs inside the <a> click, so the copy happens in the same user gesture that opens the tab.
    setChannel(ch);
    copyText(text).then((ok) => {
      if (!ok) actions.toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
    });
    actions.toast(`Copied. Paste it into ${ch === 'ig' ? 'Instagram' : 'Facebook'}, send it, then press Mark sent.`);
  };
  const copyEmail = () => {
    setChannel('email');
    copyText(toEmailText(stage, eff, cfg, text)).then((ok) => {
      if (!ok) return actions.toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
      flash('email');
      if (!String(cfg.address || '').trim()) {
        return actions.toast('Copied, but your postal address is empty. Add it in Settings before sending marketing email.', { kind: 'warn', ms: 6000 });
      }
      return undefined;
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
          <div className="stepline">
            {lead.status !== 'replied' && ['queued', 'active', 'done'].includes(lead.status) && (
              <span className="pips" role="img" aria-label={`${lead.step} of 4 messages sent`}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={`pip ${i < lead.step ? 'on' : i === lead.step && lead.status !== 'done' ? 'next' : ''}`} />
                ))}
              </span>
            )}
            <span className="step">{stage ? stage.label : `Status: ${lead.status}`}</span>
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
          <div className="genbar">
            <span className={`badge ${v.shown.source === 'personalized' ? 'ok' : ''}`}>
              {v.shown.source === 'personalized' ? 'Personalized' : 'Template'}
            </span>
            <div className="versions" role="group" aria-label="Previous versions">
              <span className="label">Versions</span>
              <button className="btn small icon" aria-label="Previous version" disabled={v.pos === 0 || generating} onClick={() => onGoto(v.pos - 1)}>◀</button>
              <span className="mono" aria-live="polite">{v.pos + 1}/{v.all.length}</span>
              <button className="btn small icon" aria-label="Next version" disabled={v.pos >= v.all.length - 1 || generating} onClick={() => onGoto(v.pos + 1)}>▶</button>
            </div>
            <span className="grow" />
            <button className="btn small" onClick={onRegenerate} disabled={generating || !env.llm.configured}>
              {generating ? <><span className="spinner" aria-hidden="true" />Writing…</> : 'Regenerate'}
            </button>
          </div>
          <input
            type="text"
            className="hint-input"
            placeholder={'Hint, e.g. "shorter" or "no phones"'}
            aria-label="Hint for regenerating"
            maxLength={200}
            value={hint}
            disabled={generating}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && env.llm.configured && !generating) onRegenerate(); }}
          />
          {!env.llm.configured && (
            <p className="hint">AI personalization is off, so this is the built-in template. See Settings to turn it on.</p>
          )}
          {!lead.hook && !lead.note && (
            <p className="hint">The more specific your note, the more personal the message. Add a hook or note with Edit lead.</p>
          )}
          {confirm && (
            <div className="notice warn" role="alertdialog" aria-label="Replace edited text?">
              <p>You edited this message. Replace it on screen? Your edit is saved as its own version, so you can come back to it.</p>
              <div className="actions" style={{ marginTop: 8 }}>
                <button className="btn small" onClick={confirmReplace}>Replace</button>
                <button className="btn small" onClick={() => setConfirm(null)}>Keep mine</button>
              </div>
            </div>
          )}

          <label className="field">
            <span className="sr-only">Message to {lead.name}</span>
            <textarea
              className={`msg ${generating ? 'busy' : ''}`}
              aria-label={`Message to ${lead.name}`}
              aria-busy={generating}
              value={text}
              rows={Math.min(16, Math.max(7, Math.ceil(text.length / 52) + 2))}
              onChange={(e) => onType(e.target.value)}
              readOnly={generating}
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

          <ol className="flow" aria-label="Steps">
            <li><i>1</i>Copy + open</li>
            <li><i>2</i>Paste and send it yourself</li>
            <li><i>3</i>Mark sent</li>
          </ol>

          <div className="actions">
            {lead.ig && (
              <a className="btn primary cta" href={lead.ig} target="_blank" rel="noopener noreferrer" onClick={copyOpen('ig')}>
                Copy + open Instagram
              </a>
            )}
            {lead.fb && (
              <a className="btn primary cta" href={lead.fb} target="_blank" rel="noopener noreferrer" onClick={copyOpen('fb')}>
                Copy + open Facebook
              </a>
            )}
          </div>
          <div className="secondary-actions">
            <button className={`btn ${flashKey === 'copy' ? 'flash' : lead.ig || lead.fb ? '' : 'primary'}`} onClick={copy}>
              {flashKey === 'copy' ? 'Copied ✓' : 'Copy'}
            </button>
            <button className={`btn ${flashKey === 'email' ? 'flash' : ''}`} onClick={copyEmail}>
              {flashKey === 'email' ? 'Copied ✓' : 'Copy as email'}
            </button>
          </div>
          {lead.email && <div className="hint">Email: <span className="mono">{lead.email}</span></div>}

          <div className="actions">
            <button className="btn ok big" disabled={!!blocked || busy} onClick={() => send(channel)}>Mark sent</button>
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
