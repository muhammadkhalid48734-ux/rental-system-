import { useEffect, useMemo, useRef, useState } from 'react';
import { PROBLEMS } from '../lib/messages.js';
import { parsePaste } from '../lib/importer.js';

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
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

const BLANK = { name: '', city: '', owner: '', ig: '', fb: '', email: '', site: '', problem: 'nosite', hook: '', note: '' };

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
      <form onSubmit={submit} ref={ref} className="section" noValidate>
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
              <label className="field">
                <span>Account</span>
                <select value={f.account} onChange={set('account')}>
                  <option value="">Not set</option>
                  <option>A</option>
                  <option>B</option>
                </select>
              </label>
              <div className="wide">{text('demoLink', 'Demo link', 'text', { inputMode: 'url' })}</div>
              <label className="check wide">
                <input type="checkbox" checked={!!f.verified} onChange={set('verified')} />
                <span>I opened the site and confirmed the problem</span>
              </label>
            </>
          )}
        </div>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <div className="modal-actions">
          {editing && (
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${lead.name}? This removes the row from your sheet.`)) return;
                try { await onDelete(lead); close(); } catch (ex) { setErr(ex.message); }
              }}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add lead'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ImportDialog({ existingNames, onImport, onClose }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const parsed = useMemo(() => parsePaste(text, existingNames), [text, existingNames]);
  const close = () => ref.current?.closest('dialog')?.close();

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await onImport(parsed.fresh);
      close();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import leads" onClose={onClose}>
      <div className="section" ref={ref}>
        <p className="hint">
          Paste rows copied from your sheet (tab-separated). Columns in order:
          {' '}<b>business, website, Instagram, Facebook, note, email</b>. A header row is ignored.
          Duplicate names are skipped, tracking parameters are removed, and the problem is guessed from the note and website.
        </p>
        <textarea
          rows={7}
          aria-label="Pasted rows"
          placeholder={'Fun Jumps\thttps://funjumps.com\t@funjumps\t\tsite down since May\thi@funjumps.com'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mono"
          style={{ fontSize: 13 }}
          autoFocus
        />
        {parsed.rows.length > 0 && (
          <>
            <p className="hint">
              <b>{parsed.fresh.length}</b> new
              {parsed.skippedDup ? `, ${parsed.skippedDup} duplicate${parsed.skippedDup === 1 ? '' : 's'} skipped` : ''}
              {parsed.skippedEmpty ? `, ${parsed.skippedEmpty} blank` : ''}. Check the guessed problems below; you can edit any lead afterwards.
            </p>
            <div className="preview">
              {parsed.rows.slice(0, 100).map((r, i) => (
                <div className={`pr ${r.dup ? 'dup' : ''}`} key={`${r.name}-${i}`}>
                  <span>{r.name}{r.email ? ` · ${r.email}` : ''}</span>
                  <span className={`badge prob-${r.problem}`}>{r.dup ? 'duplicate' : PROBLEMS[r.problem]}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {err && <div className="notice bad" role="alert">{err}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={busy || parsed.fresh.length === 0} onClick={go}>
            {busy ? 'Importing…' : `Import ${parsed.fresh.length || ''} lead${parsed.fresh.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
