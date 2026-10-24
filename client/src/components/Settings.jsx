import { useState } from 'react';
import { copyText, leadsToCsv } from '../lib/clipboard.js';

const GROUPS = [
  {
    title: 'Accounts and daily limit',
    note: 'Names are just labels for your two sending accounts.',
    fields: [
      ['accA', 'Account A name', 'text', 'e.g. @studio_one'],
      ['accB', 'Account B name', 'text', 'e.g. @studio_two'],
      ['cap', 'New DMs per account per day', 'number', ''],
      ['gaps', 'Follow-up gaps in days (after message 1, 2, 3)', 'text', '2,3,4'],
    ],
  },
  {
    title: 'Your details',
    note: 'Used in email footers. A postal address and unsubscribe line are expected on marketing email.',
    fields: [
      ['yourName', 'Your name', 'text', ''],
      ['studio', 'Studio name', 'text', ''],
      ['address', 'Postal address', 'text', 'Street, city, country', true],
    ],
  },
];

const PACKAGES = [1, 2, 3];

export default function Settings({ config, leads, onSave, toast, session, onLogout }) {
  const [form, setForm] = useState({ ...config });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(config);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      toast('Settings saved', { kind: 'good' });
    } catch (err) {
      toast(err.message, { kind: 'bad', ms: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () =>
    copyText(leadsToCsv(leads)).then((ok) => toast(ok ? `Copied ${leads.length} leads as CSV` : 'Copy failed', ok ? {} : { kind: 'bad' }));

  return (
    <>
      <form className="section" onSubmit={save}>
        {GROUPS.map((g) => (
          <div className="card" key={g.title}>
            <div className="group-title">
              <h3>{g.title}</h3>
              <p className="hint">{g.note}</p>
            </div>
            <div className="form-grid">
              {g.fields.map(([key, label, type, ph, wide]) => (
                <label className={`field ${wide ? 'wide' : ''}`} key={key}>
                  <span>{label}</span>
                  <input type={type} value={form[key] ?? ''} placeholder={ph} onChange={set(key)} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 100 : undefined} />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="group-title">
          <h3>Demo packages</h3>
          <p className="hint">
            Shown together with their setup and monthly price in the demo message. Leave monthly empty for a one-time price (the message then says “no monthly fee”).
            These are the only prices the app ever writes.
          </p>
        </div>
        {PACKAGES.map((n) => (
          <div className="card" key={n}>
            <div className="group-title">
              <h3>Package {n}{n === 2 ? ' · Recommended' : ''}</h3>
              {n === 2 && <p className="hint">Labelled “Recommended” in the demo message.</p>}
            </div>
            <div className="form-grid">
              <label className="field wide">
                <span>Name</span>
                <input type="text" value={form[`pkg${n}Name`] ?? ''} onChange={set(`pkg${n}Name`)} />
              </label>
              <label className="field">
                <span>Setup price (USD)</span>
                <input type="text" inputMode="decimal" value={form[`pkg${n}Setup`] ?? ''} onChange={set(`pkg${n}Setup`)} placeholder="247" />
              </label>
              <label className="field">
                <span>Monthly price (USD, optional)</span>
                <input type="text" inputMode="decimal" value={form[`pkg${n}Monthly`] ?? ''} onChange={set(`pkg${n}Monthly`)} placeholder="none" />
              </label>
              <label className="field wide">
                <span>What's included (one line)</span>
                <textarea rows={3} maxLength={400} value={form[`pkg${n}Note`] ?? ''} onChange={set(`pkg${n}Note`)} />
              </label>
            </div>
          </div>
        ))}

        <div className="savebar">
          <span className="hint">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
          <button className="btn primary" type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>

      <div className="card">
        <div className="group-title">
          <h3>AI personalization</h3>
          {session.llm.configured ? (
            <p className="hint">On. Messages are written by Groq (<span className="mono">{session.llm.model}</span>). Only lead data (business name, owner's first name, city, problem, note, hook) and your earlier messages to that lead are sent; free-tier providers may use prompts to improve their service.</p>
          ) : (
            <p className="hint warn">Off. Add your Groq API key to the server's environment settings (see the README) to turn on Regenerate and “Generate all”. The app keeps working with the built-in templates.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="group-title">
          <h3>Export</h3>
          <p className="hint">Copies every lead as CSV so you can paste it into a spreadsheet.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={exportCsv}>Copy all leads as CSV</button>
        </div>
      </div>

      {session.authRequired && (
        <div className="card">
          <div className="group-title"><h3>Session</h3></div>
          <div className="actions"><button className="btn" onClick={onLogout}>Log out</button></div>
        </div>
      )}
    </>
  );
}
