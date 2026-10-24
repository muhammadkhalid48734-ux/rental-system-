import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { copyText } from '../lib/clipboard.js';
import { EMPTY, genCache } from '../lib/genCache.js';
import { cacheKey, errorMessage, goTo, requestVariant, stashEdit, view } from '../lib/gen.js';
import { buildMessage, getStage, hasLink, hasPlaceholder, PROBLEMS, toEmailText } from '../lib/messages.js';
import { dueBadge } from '../lib/ui.js';
import { I, Icon } from './icons.jsx';

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = [...ref.current.querySelectorAll('[role="menuitem"]')];
        const i = list.indexOf(document.activeElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-quiet" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon as={I.DotsThree} /> More
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.run(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Problem tag, note and hook (both editable inline, saved on blur), site link, and a nudge when both are empty. */
function AboutStrip({ lead, actions }) {
  const [hook, setHook] = useState(lead.hook || '');
  const [note, setNote] = useState(lead.note || '');
  useEffect(() => { setHook(lead.hook || ''); }, [lead.hook]);
  useEffect(() => { setNote(lead.note || ''); }, [lead.note]);

  const save = (field, value) => {
    const v = value.trim();
    if (v === (lead[field] || '')) return;
    actions.patch(lead.id, { [field]: v }, undefined, { quiet: true });
  };
  const bothEmpty = !hook.trim() && !note.trim();

  return (
    <section className="about" aria-label="About this lead">
      <div className="about-head">
        <h3>About this lead</h3>
        <span className={`tag tag-${lead.problem}`}>{PROBLEMS[lead.problem] || lead.problem}</span>
        <span className="grow" />
        {lead.site && (
          <a className="btn btn-secondary btn-sm" href={lead.site} target="_blank" rel="noopener noreferrer">
            Open site <Icon as={I.ArrowSquareOut} size="sm" />
          </a>
        )}
      </div>
      <div className="about-fields">
        <label className="field">
          <span className="label">Note</span>
          <textarea
            rows={2}
            value={note}
            maxLength={2000}
            placeholder="What did you notice about their site or business?"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save('note', note)}
          />
        </label>
        <label className="field">
          <span className="label">Hook: finishes “I love …”</span>
          <input
            type="text"
            value={hook}
            maxLength={300}
            placeholder="e.g. your pastel balloon arches"
            onChange={(e) => setHook(e.target.value)}
            onBlur={() => save('hook', hook)}
          />
        </label>
      </div>
      {bothEmpty && (
        <p className="inline-warn" role="note">
          <Icon as={I.Warning} />
          <span>The more specific your note, the more personal the message. Add a note or a hook before you personalize.</span>
        </p>
      )}
    </section>
  );
}

// Personalized messages are written automatically the first time a lead is opened. One attempt per message
// step, so a failure never turns into a request loop; the card then offers a manual retry.
const autoTried = new Set();
const inFlight = new Map();

export default function LeadCard({ lead, env, defaultAccount, active = false }) {
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
  const due = dueBadge(lead, cfg);

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

  // "Copied" feedback, and the cue that moves the single primary button from "copy" to "Mark sent".
  const [flashKey, setFlashKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  useEffect(() => { setCopied(false); }, [gkey]);
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

  const [aiError, setAiError] = useState('');
  useEffect(() => { setAiError(''); }, [gkey]);

  const runRegenerate = async () => {
    setConfirm(null);
    stashEdit(gkey, template);
    setGenerating(true);
    setAiError('');
    const job = requestVariant({ lead: eff, stage, hint: hint.trim(), template });
    inFlight.set(gkey, job);
    try {
      const res = await job;
      if (res.source === 'template') {
        const msg = 'The AI draft did not pass the safety checks. Try again.';
        setAiError(msg);
        actions.toast(msg, { kind: 'warn', ms: 6000 });
      }
    } catch (err) {
      const msg = errorMessage(err);
      setAiError(msg);
      actions.toast(msg, { kind: 'bad', ms: 6000 });
    } finally {
      inFlight.delete(gkey);
      setGenerating(false);
    }
  };

  // Write the personalized message as soon as the lead is on screen (and AI is configured).
  const needAuto = !!(
    showMessage && env.llm.configured && gkey && entry.draft === null
    && !entry.versions.some((x) => x.source === 'personalized')
    && !(stage?.key === 'demo' && lead.demoLink !== eff.demoLink)
  );
  useEffect(() => {
    if (!needAuto) return undefined;
    if (inFlight.has(gkey)) {
      let live = true;
      setGenerating(true);
      inFlight.get(gkey).catch(() => {}).finally(() => { if (live) setGenerating(false); });
      return () => { live = false; };
    }
    if (autoTried.has(gkey)) return undefined;
    autoTried.add(gkey);
    runRegenerate();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gkey, needAuto]);
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

  // With AI on, only a personalized message (or your own edit of it) can be copied or marked sent.
  const awaitingAI = env.llm.configured && showMessage && v.shown.source !== 'personalized' && !edited;
  // True from the first render of a lead that is about to be written, so the template never flashes.
  const writing = generating || (needAuto && !autoTried.has(gkey));

  const needsCheck = lead.problem === 'down' || lead.problem === 'parked';
  const blockedByCheck = needsCheck && !verified && stage?.key === 'pitch';
  const atLimit = isNew && newBy[account] >= cfg.cap;
  const blocked = blockedByCheck
    ? 'Tick the confirm box first.'
    : atLimit
      ? `Account ${account} has reached its daily limit of ${cfg.cap} new DMs. Switch to the other account.`
      : awaitingAI
        ? 'Waiting for the personalized message.'
        : '';

  const send = (ch) => {
    if (blocked) {
      actions.toast(blocked, { kind: 'warn', ms: 5000 });
      return;
    }
    actions.send(lead, stage, account, ch, eff.demoLink, text);
  };

  const copy = () => {
    if (awaitingAI) {
      actions.toast('The personalized message is not ready yet.', { kind: 'warn' });
      return;
    }
    copyText(text).then((ok) => {
      if (ok) { flash('copy'); setCopied(true); } else actions.toast('Copy failed. Select the text and copy it by hand.', { kind: 'bad' });
    });
  };
  const copyOpen = (ch) => (e) => {
    if (awaitingAI) {
      e.preventDefault();
      actions.toast('The personalized message is not ready yet.', { kind: 'warn' });
      return;
    }
    // Runs inside the <a> click, so the copy happens in the same user gesture that opens the tab.
    setChannel(ch);
    setCopied(true);
    copyText(text).then((ok) => {
      if (!ok) actions.toast('Copy failed. Select the text and copy it by hand.', { kind: 'bad' });
    });
    actions.toast(`Copied. Paste it into ${ch === 'ig' ? 'Instagram' : 'Facebook'}, send it, then press Mark sent.`);
  };
  const copyEmail = () => {
    if (awaitingAI) {
      actions.toast('The personalized message is not ready yet.', { kind: 'warn' });
      return;
    }
    setChannel('email');
    copyText(toEmailText(stage, eff, cfg, text)).then((ok) => {
      if (!ok) return actions.toast('Copy failed. Select the text and copy it by hand.', { kind: 'bad' });
      flash('email');
      setCopied(true);
      if (!String(cfg.address || '').trim()) {
        return actions.toast('Copied, but your postal address is empty. Add it in Settings before sending marketing email.', { kind: 'warn', ms: 6000 });
      }
      return undefined;
    });
  };

  // "C" in the queue copies the message of the lead on screen (App dispatches the event).
  const copyRef = useRef(copy);
  copyRef.current = copy;
  useEffect(() => {
    if (!active || !showMessage) return undefined;
    const onCopyKey = () => copyRef.current();
    window.addEventListener('outreach:copy', onCopyKey);
    return () => window.removeEventListener('outreach:copy', onCopyKey);
  }, [active, showMessage]);

  const saveLink = () => {
    const link = linkDraft.trim();
    if (link === (lead.demoLink || '')) return;
    if (link && !hasLink(link)) {
      actions.toast('The demo link must start with http:// or https://', { kind: 'warn' });
      return;
    }
    actions.patch(lead.id, { demoLink: link }, undefined, { quiet: true });
  };

  const menuItems = [];
  if (!['replied', 'won'].includes(lead.status)) {
    menuItems.push({ label: 'They replied', run: () => actions.patch(lead.id, { status: 'replied', repliedAt: new Date().toISOString() }, 'Moved to replies') });
  }
  if (lead.status !== 'won') menuItems.push({ label: 'Won', run: () => actions.patch(lead.id, { status: 'won' }, 'Marked won') });
  if (lead.status !== 'lost') menuItems.push({ label: 'Not interested', run: () => actions.patch(lead.id, { status: 'lost' }, 'Marked not interested') });
  menuItems.push({ label: 'Edit lead', run: () => actions.edit(lead) });

  // Exactly one primary button per state: copy first, then Mark sent once the message has been copied.
  const primary = !showMessage ? null : copied ? 'mark' : lead.ig ? 'ig' : lead.fb ? 'fb' : 'copy';
  const cls = (key) => `btn ${primary === key && !awaitingAI ? 'btn-primary' : 'btn-secondary'}`;

  const accName = account === 'A' ? cfg.accA : cfg.accB;
  const sub = [lead.city, lead.owner].filter(Boolean).join(' · ');
  const stepsSent = lead.step;

  return (
    <article className={`detail ${lead.status === 'replied' ? 'is-reply' : ''}`} aria-label={`Lead: ${lead.name}`}>
      <header className="detail-head">
        <div style={{ minWidth: 0 }}>
          <h2>{lead.name}</h2>
          {sub && <p className="sub">{sub}</p>}
          <div className="stepline">
            {lead.status !== 'replied' && ['queued', 'active', 'done'].includes(lead.status) && (
              <span className="pips" role="img" aria-label={`${stepsSent} of 4 messages sent`}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={`pip ${i < stepsSent ? 'on' : i === stepsSent && lead.status !== 'done' ? 'next' : ''}`} />
                ))}
              </span>
            )}
            <span className="step-text">{stage ? stage.label : `Status: ${lead.status}`}</span>
          </div>
        </div>
        <div className="badges">
          {(lead.account || isNew) && <span className={`tag tag-${account}`}>{account}{accName ? ` · ${accName}` : ''}</span>}
          {due && <span className={`tag ${due.tone === 'bad' ? 'tag-bad' : due.tone === 'warn' ? 'tag-warn' : ''}`}>{due.text}</span>}
          {needsCheck && !verified && <span className="tag tag-warn"><Icon as={I.Warning} size="sm" /> Unverified</span>}
          {lead.status === 'replied' && <span className="tag tag-info">Replied</span>}
        </div>
      </header>

      <AboutStrip lead={lead} actions={actions} />

      {needsCheck && (
        <div className={`verify ${verified ? '' : 'is-open'}`}>
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
          {!lead.site && <span className="hint">No site address saved. Add one with More, then Edit lead.</span>}
        </div>
      )}

      {lead.status === 'replied' && (
        <label className="field">
          <span className="label">Demo link (paste it here to switch to the demo-delivery message)</span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onBlur={saveLink}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </label>
      )}

      {stage?.key === 'replyWait' && (
        <div className="notice" role="note">
          <Icon as={I.Info} />
          <div>Photo-permission message sent. Once they agree, build the private demo and paste its link above to get the delivery message.</div>
        </div>
      )}

      {showMessage && (
        <div className="account-row">
          <span className="label" id={`acct-${lead.id}`}>Send from account</span>
          {isNew ? (
            <div className="seg" role="group" aria-labelledby={`acct-${lead.id}`}>
              {['A', 'B'].map((a) => (
                <button
                  key={a}
                  aria-pressed={account === a}
                  disabled={busy}
                  onClick={() => account !== a && actions.patch(lead.id, { account: a })}
                >
                  <span className={`acct ${a === 'B' ? 'acct-B' : ''}`} aria-hidden="true">{a}</span>
                  <span className="sr-only">Account </span>{(a === 'A' ? cfg.accA : cfg.accB) || a}
                  <span className="num" style={{ fontWeight: 500 }}>{newBy[a]}/{cfg.cap}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="tag">{account}{accName ? ` · ${accName}` : ''} (follow-ups stay on the account that sent the first message)</span>
          )}
        </div>
      )}

      {showMessage && (
        <>
          <div className="genbar">
            <span className={`tag ${v.shown.source === 'personalized' ? 'tag-ok' : ''}`}>
              {v.shown.source === 'personalized' ? 'Personalized' : 'Template'}
            </span>
            <div className="versions" role="group" aria-label="Previous versions">
              <button className="btn btn-secondary btn-icon" aria-label="Previous version" disabled={v.pos === 0 || generating} onClick={() => onGoto(v.pos - 1)}>
                <Icon as={I.CaretLeft} />
              </button>
              <span className="num" aria-live="polite">{v.pos + 1}/{v.all.length}</span>
              <button className="btn btn-secondary btn-icon" aria-label="Next version" disabled={v.pos >= v.all.length - 1 || generating} onClick={() => onGoto(v.pos + 1)}>
                <Icon as={I.CaretRight} />
              </button>
            </div>
            <span className="grow" />
            <button className="btn btn-secondary" onClick={onRegenerate} disabled={generating || !env.llm.configured}>
              {generating ? <><span className="spinner" aria-hidden="true" /> Writing</> : <><Icon as={I.Sparkle} /> Regenerate</>}
            </button>
          </div>
          <div className="hint-row">
            <input
              type="text"
              aria-label="Hint for regenerating"
              placeholder={'Hint, e.g. "shorter" or "no phones"'}
              maxLength={200}
              value={hint}
              disabled={generating}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && env.llm.configured && !generating) onRegenerate(); }}
            />
            {!env.llm.configured && (
              <p className="inline-note"><Icon as={I.Info} /><span>AI personalization is off, so this is the built-in template. Settings explains how to turn it on.</span></p>
            )}
          </div>

          {awaitingAI && !writing && (
            <div className="notice notice-warn" role="alert">
              <Icon as={I.Warning} />
              <div>
                <p>{aiError || 'No personalized message yet.'} Copy and Mark sent unlock once it is written, or after you edit the text yourself.</p>
                <div className="actions" style={{ marginTop: 'var(--s-3)' }}>
                  <button className="btn btn-primary btn-sm" onClick={runRegenerate}><Icon as={I.Sparkle} /> Write personalized message</button>
                </div>
              </div>
            </div>
          )}

          {confirm && (
            <div className="notice notice-warn" role="alertdialog" aria-label="Replace edited text?">
              <Icon as={I.Warning} />
              <div>
                <p>You edited this message. Replace it on screen? Your edit is saved as its own version, so you can come back to it.</p>
                <div className="actions" style={{ marginTop: 'var(--s-3)' }}>
                  <button className="btn btn-secondary btn-sm" onClick={confirmReplace}>Replace</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)}>Keep mine</button>
                </div>
              </div>
            </div>
          )}

          <div className="msg-wrap">
            <label className="sr-only" htmlFor={`msg-${lead.id}`}>Message to {lead.name}</label>
            <textarea
              id={`msg-${lead.id}`}
              className={`msg ${writing ? 'busy' : ''}`}
              aria-busy={generating}
              value={awaitingAI ? '' : text}
              placeholder={awaitingAI ? (writing ? `Writing a personalized message for ${lead.name}…` : 'No personalized message yet. Write it above, or type your own.') : undefined}
              rows={Math.min(16, Math.max(8, Math.ceil(text.length / 64) + 2))}
              onChange={(e) => onType(e.target.value)}
              readOnly={writing}
              spellCheck
            />
            {edited && (
              <div className="actions">
                <span className="hint">Your edits are kept until you mark it sent.</span>
                <button className="btn btn-quiet btn-sm" onClick={resetText}>Reset text</button>
              </div>
            )}
            {hasPlaceholder(text) && (
              <p className="reason"><Icon as={I.Warning} /><span>The message still contains [placeholder] text. Fix it above or in Settings before sending.</span></p>
            )}
          </div>

          <div className="stack-sm">
            <div className="actions-main">
              {lead.ig && (
                <a className={cls('ig')} aria-disabled={awaitingAI || undefined} href={lead.ig} target="_blank" rel="noopener noreferrer" onClick={copyOpen('ig')}>
                  <Icon as={I.InstagramLogo} /> Copy + open Instagram <Icon as={I.ArrowSquareOut} size="sm" />
                </a>
              )}
              {lead.fb && (
                <a className={cls('fb')} aria-disabled={awaitingAI || undefined} href={lead.fb} target="_blank" rel="noopener noreferrer" onClick={copyOpen('fb')}>
                  <Icon as={I.FacebookLogo} /> Copy + open Facebook <Icon as={I.ArrowSquareOut} size="sm" />
                </a>
              )}
              <button className={flashKey === 'copy' ? 'btn btn-flash' : cls('copy')} aria-disabled={awaitingAI || undefined} onClick={copy}>
                <Icon as={flashKey === 'copy' ? I.Check : I.CopySimple} /> {flashKey === 'copy' ? 'Copied' : 'Copy'}
              </button>
              <button className={flashKey === 'email' ? 'btn btn-flash' : 'btn btn-secondary'} aria-disabled={awaitingAI || undefined} onClick={copyEmail}>
                <Icon as={flashKey === 'email' ? I.Check : I.EnvelopeSimple} /> {flashKey === 'email' ? 'Copied' : 'Copy as email'}
              </button>
            </div>
            {lead.email && <p className="hint">Email: <span className="num">{lead.email}</span></p>}
            <p className="hint">
              {copied
                ? 'Sent it? Press Mark sent to record it and move on.'
                : 'Copy the message, paste it and send it yourself, then come back and press Mark sent.'}
            </p>
          </div>

          <div className="mark-row">
            <button className={cls('mark')} disabled={!!blocked || busy} onClick={() => send(channel)}>
              <Icon as={I.CheckCircle} /> Mark sent
            </button>
            <label>
              via
              <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel used">
                <option value="ig">Instagram</option>
                <option value="fb">Facebook</option>
                <option value="email">Email</option>
              </select>
            </label>
            <span className="grow" />
            <MoreMenu items={menuItems} />
          </div>
          {blocked && <p className="reason"><Icon as={I.Warning} /><span>{blocked}</span></p>}
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
