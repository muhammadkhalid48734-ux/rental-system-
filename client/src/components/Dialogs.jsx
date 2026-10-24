import { useEffect, useMemo, useRef, useState } from 'react';
import { I, Icon } from './icons.jsx';
import { PROBLEMS } from '../lib/messages.js';
import { IMPORT_STATUSES, cellText, parsePaste, resolveProgress } from '../lib/importer.js';
import { nextAction } from '../lib/schedule.js';
import { fmtShortDate, parseDay, ymd } from '../lib/dates.js';

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-quiet btn-icon" aria-label={`Close ${title}`} onClick={() => ref.current?.close()}>
            <Icon as={I.X} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

const BLANK = { name: '', city: '', owner: '', ig: '', fb: '', email: '', site: '', problem: 'nosite', hook: '', note: '', account: '' };

/** Add (lead = null) or edit a lead. onSave must throw to keep the dialog open. */
export function LeadDialog({ lead, onSave, onDelete, onClose }) {
  const editing = !!lead;
  const [f, setF] = useState(() => (editing ? { ...lead } : { ...BLANK }));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const close = () => ref.current?.closest('dialog')?.close();

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Business name is required.');
    setSaving(true);
    setErr('');
    try {
      const payload = { ...f };
      if (editing) {
        payload.step = Number(payload.step) || 0;
        delete payload.id;
        delete payload.order;
      }
      await onSave(payload);
      close();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const text = (k, label, type = 'text', extra = {}) => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={f[k] ?? ''} onChange={set(k)} {...extra} />
    </label>
  );

  return (
    <Modal title={editing ? 'Edit lead' : 'Add lead'} onClose={onClose}>
      <form onSubmit={submit} ref={ref} className="stack" noValidate>
        <div className="form-grid">
          <div className="wide">{text('name', 'Business name *', 'text', { autoFocus: true, required: true })}</div>
          {text('city', 'City')}
          {text('owner', 'Owner (first name is used in the greeting)')}
          {text('ig', 'Instagram link', 'text', { inputMode: 'url' })}
          {text('fb', 'Facebook link', 'text', { inputMode: 'url' })}
          {text('email', 'Email', 'email')}
          {text('site', 'Website', 'text', { inputMode: 'url' })}
          <label className="field">
            <span>Problem</span>
            <select value={f.problem} onChange={set('problem')}>
              {Object.entries(PROBLEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {text('hook', 'Hook: finishes “I love …” (e.g. your pastel balloon arches)')}
          <label className="field wide">
            <span>Note</span>
            <textarea rows={2} value={f.note ?? ''} onChange={set('note')} />
          </label>
          <label className="field">
            <span>Send from account</span>
            <select value={f.account} onChange={set('account')}>
              <option value="">Automatic (whichever has room)</option>
              <option value="A">Account A</option>
              <option value="B">Account B</option>
            </select>
          </label>
          {editing && (
            <>
              <label className="field">
                <span>Status</span>
                <select value={f.status} onChange={set('status')}>
                  {['queued', 'active', 'replied', 'won', 'lost', 'done'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Track</span>
                <select value={f.track} onChange={set('track')}>
                  <option>cold</option>
                  <option>demo</option>
                </select>
              </label>
              <label className="field">
                <span>Messages sent in this track (0-4)</span>
                <input type="number" min={0} max={4} value={f.step} onChange={set('step')} />
              </label>
              <div className="wide">{text('demoLink', 'Demo link', 'text', { inputMode: 'url' })}</div>
              <label className="check wide">
                <input type="checkbox" checked={!!f.verified} onChange={set('verified')} />
                <span>I opened the site and confirmed the problem</span>
              </label>
            </>
          )}
        </div>
        {err && <div className="notice notice-bad" role="alert"><Icon as={I.XCircle} /><div>{err}</div></div>}
        <div className="modal-actions">
          {editing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${lead.name}? This removes the row from your sheet.`)) return;
                try { await onDelete(lead); close(); } catch (ex) { setErr(ex.message); }
              }}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add lead'}</button>
        </div>
      </form>
    </Modal>
  );
}

const EXAMPLE = [
  'Fun Jumps\thttps://funjumps.com\t@funjumps\t\tsite looks old\thi@funjumps.com\tactive\t2\t2026-10-20\tA',
  'Castle Kings\t\t\thttps://facebook.com/castlekings\tposts daily\t\tqueued',
].join('\n');

const FIELD_KEYS = ['status', 'step', 'lastSent', 'account'];

export function ImportDialog({ existingNames, cfg, onImport, onClose }) {
  const [text, setText] = useState('');
  const [edits, setEdits] = useState({}); // row index -> fixes typed in the preview, and skip flags
  const [defaultAccount, setDefaultAccount] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const close = () => ref.current?.closest('dialog')?.close();

  const parsed = useMemo(() => parsePaste(text, existingNames), [text, existingNames]);
  useEffect(() => { setEdits({}); }, [text]); // row numbers change with the paste, so drop old fixes

  const items = useMemo(() => {
    const now = new Date();
    return parsed.rows.map((row, i) => {
      if (row.dup) return { row, i, state: 'dup' };
      const e = edits[i] || {};
      const raw = row.raw ? { ...row.raw, ...Object.fromEntries(FIELD_KEYS.filter((k) => k in e).map((k) => [k, e[k]])) } : null;
      const res = raw ? resolveProgress(raw, { now, defaultAccount }) : { errors: [], notes: [], progress: null };
      const next = res.progress ? nextAction(res.progress, cfg, now) : null;
      const state = e.skip ? 'skipped' : res.errors.length ? 'error' : 'ready';
      return { row, i, raw, res, next, state };
    });
  }, [parsed, edits, defaultAccount, cfg]);

  const ready = items.filter((x) => x.state === 'ready');
  const count = (st) => items.filter((x) => x.state === st).length;
  const setEdit = (i, patch) => setEdits((all) => ({ ...all, [i]: { ...all[i], ...patch } }));

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const leads = ready.map(({ row, res }) => ({
        name: row.name, site: row.site, ig: row.ig, fb: row.fb, email: row.email, note: row.note, problem: row.problem,
        ...(res.progress
          ? {
            status: res.progress.status, track: 'cold', step: res.progress.step, account: res.progress.account,
            lastSentAt: res.progress.lastSentAt, repliedAt: res.progress.repliedAt,
          }
          : {}),
      }));
      await onImport(leads);
      close();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const today = ymd(new Date());

  return (
    <Modal title="Import leads" onClose={onClose}>
      <div className="stack" ref={ref}>
        <p className="hint">
          Paste rows copied from your sheet (tab-separated). Columns in order:
          {' '}<b>business, website, Instagram, Facebook, note, email</b>, then optionally, for leads you already messaged:
          {' '}<b>status</b> (queued, active, replied, won, lost, done), <b>step</b> (0-4 messages already sent),
          {' '}<b>lastSentAt</b> (YYYY-MM-DD) and <b>account</b> (A or B). A header row is ignored.
          Duplicate names are skipped, tracking parameters are removed, and the problem is guessed.
        </p>
        <textarea
          rows={6}
          aria-label="Pasted rows"
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="paste"
          style={{ fontSize: 13 }}
          autoFocus
        />

        {parsed.hasProgress && (
          <label className="field">
            <span>Account for rows that already have messages sent but no account</span>
            <select value={defaultAccount} onChange={(e) => setDefaultAccount(e.target.value)} style={{ width: 'auto' }}>
              <option value="">None (show an error)</option>
              <option value="A">A · {cfg.accA}</option>
              <option value="B">B · {cfg.accB}</option>
            </select>
          </label>
        )}

        {items.length > 0 && (
          <>
            <p className="hint" role="status">
              <b>{ready.length}</b> ready
              {count('error') ? <>, <b className="bad-text">{count('error')}</b> need fixing (not imported until fixed or skipped)</> : ''}
              {count('skipped') ? `, ${count('skipped')} skipped` : ''}
              {parsed.skippedDup ? `, ${parsed.skippedDup} duplicate${parsed.skippedDup === 1 ? '' : 's'} left out` : ''}
              {parsed.skippedEmpty ? `, ${parsed.skippedEmpty} blank` : ''}.
              {' '}You can edit any lead afterwards.
            </p>
            <div className="imp-list">
              {items.slice(0, 200).map((it) => (
                <div className={`imp-row ${it.state}`} key={`${it.row.name}-${it.i}`}>
                  <div className="imp-head">
                    <b>{it.row.name}{it.row.email ? ` · ${it.row.email}` : ''}</b>
                    <span className={`tag tag-${it.row.problem}`}>{it.state === 'dup' ? 'duplicate' : PROBLEMS[it.row.problem]}</span>
                  </div>

                  {it.state !== 'dup' && (
                    <>
                      {it.raw && (
                        <div className="imp-fields">
                          <label className="field">
                            <span>Status</span>
                            <select value={cellText(it.raw.status).toLowerCase()} onChange={(e) => setEdit(it.i, { status: e.target.value })}>
                              <option value="">(from step)</option>
                              {IMPORT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                              {it.raw.status.trim() && !IMPORT_STATUSES.includes(it.raw.status.trim().toLowerCase()) && (
                                <option value={cellText(it.raw.status).toLowerCase()}>{it.raw.status.trim()} (invalid)</option>
                              )}
                            </select>
                          </label>
                          <label className="field">
                            <span>Step (0-4)</span>
                            <input type="text" inputMode="numeric" value={cellText(it.raw.step)} onChange={(e) => setEdit(it.i, { step: e.target.value })} />
                          </label>
                          <label className="field">
                            <span>Last sent</span>
                            <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={cellText(it.raw.lastSent)} onChange={(e) => setEdit(it.i, { lastSent: e.target.value })} />
                          </label>
                          <label className="field">
                            <span>Account</span>
                            <select value={cellText(it.raw.account).toUpperCase()} onChange={(e) => setEdit(it.i, { account: e.target.value })}>
                              <option value="">(none)</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                              {it.raw.account.trim() && !['A', 'B'].includes(it.raw.account.trim().toUpperCase()) && (
                                <option value={cellText(it.raw.account).toUpperCase()}>{it.raw.account.trim()} (invalid)</option>
                              )}
                            </select>
                          </label>
                        </div>
                      )}

                      {it.res.errors.length > 0 && (
                        <ul className="imp-errors" role="alert">
                          {it.res.errors.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                      )}
                      {it.state !== 'error' && (
                        <p className="hint imp-next">
                          {it.res.progress ? (
                            <>
                              Step {it.res.progress.step} of 4
                              {it.res.progress.lastSentDay && parseDay(it.res.progress.lastSentDay)
                                ? <> · last sent {fmtShortDate(parseDay(it.res.progress.lastSentDay))}{it.res.progress.lastSentDay === today ? ' (today)' : ''}</>
                                : null}
                              {' · '}<b>Next: {it.next.text}</b>
                              {it.res.notes.length ? <span className="muted"> ({it.res.notes.join('; ')})</span> : null}
                            </>
                          ) : (
                            <><b>Next: New DM, ready today</b> (subject to the daily limit)</>
                          )}
                        </p>
                      )}
                      <label className="check imp-skip">
                        <input type="checkbox" checked={it.state !== 'skipped'} onChange={(e) => setEdit(it.i, { skip: !e.target.checked })} />
                        <span>{it.state === 'skipped' ? 'Skipped' : 'Import this row'}</span>
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {items.length > 200 && <p className="hint">Showing the first 200 rows of {items.length}.</p>}
        {err && <div className="notice notice-bad" role="alert"><Icon as={I.XCircle} /><div>{err}</div></div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || ready.length === 0} onClick={go}>
            {busy ? 'Importing…' : `Import ${ready.length} lead${ready.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
