import { useState } from 'react';
import { copyText, leadsToCsv } from '../lib/clipboard.js';
import { I, Icon } from './icons.jsx';

const GROUPS = [
  {
    title: 'Accounts and daily limit',
    note: 'Names are just labels for your sending accounts.',
    fields: [
      ['accA', 'Account A name', 'text', 'e.g. @studio_one'],
      ['accB', 'Account B name', 'text', 'e.g. @studio_two'],
      ['accC', 'Account C name', 'text', 'e.g. @studio_three'],
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
      ['siteUrl', 'Plans page link (Hopbook), shown in the "Go live" reply', 'url', 'https://', true],
    ],
  },
];

const PLANS = [1, 2, 3];

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
      <h2 className="sr-only">Settings</h2>
      <form className="stack" onSubmit={save}>
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
          <h3>Monthly plans</h3>
          <p className="hint">
            The website build is free; these are the only prices the app ever writes, and only in your Quick replies. First messages and the demo delivery message never contain a price.
          </p>
        </div>
        <div className="card">
          <label className="check">
            <input type="checkbox" checked={String(form.foundingOffer).toLowerCase() === 'true'} onChange={set('foundingOffer')} />
            <span>Founding offer: show the lower first-year price in pricing replies</span>
          </label>
        </div>
        {PLANS.map((n) => (
          <div className="card" key={n}>
            <div className="group-title">
              <h3>Plan {n}{n === 2 ? ' · Recommended' : ''}</h3>
              {n === 2 && <p className="hint">The plan your “How much?” reply recommends by default.</p>}
            </div>
            <div className="form-grid">
              <label className="field wide">
                <span>Name</span>
                <input type="text" value={form[`plan${n}Name`] ?? ''} onChange={set(`plan${n}Name`)} />
              </label>
              <label className="field">
                <span>Price per month (USD)</span>
                <input type="text" inputMode="decimal" value={form[`plan${n}Price`] ?? ''} onChange={set(`plan${n}Price`)} placeholder="59" />
              </label>
              <label className="field">
                <span>Founding price, first year (USD)</span>
                <input type="text" inputMode="decimal" value={form[`plan${n}Founding`] ?? ''} onChange={set(`plan${n}Founding`)} placeholder="39" />
              </label>
              <label className="field wide">
                <span>What's included (one line)</span>
                <textarea rows={3} maxLength={400} value={form[`plan${n}Note`] ?? ''} onChange={set(`plan${n}Note`)} />
              </label>
            </div>
          </div>
        ))}

        <div className="savebar">
          <span className="hint">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
          <button className="btn btn-primary" type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>

      <div className="card">
        <div className="group-title">
          <h3>AI personalization</h3>
        </div>
        {session.llm.configured ? (
          <div className="notice notice-ok" role="status">
            <Icon as={I.CheckCircle} />
            <div>On. Messages are written by Groq (<span className="num">{session.llm.model}</span>). Only lead data (business name, owner's first name, city, problem, note, hook) and your earlier messages to that lead are sent. Free-tier providers may use prompts to improve their service.</div>
          </div>
        ) : (
          <div className="notice notice-warn" role="status">
            <Icon as={I.Warning} />
            <div>Off. Add your Groq API key to the server's environment settings (see the README) to turn on Regenerate and Generate all. The app keeps working with the built-in templates.</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="group-title">
          <h3>Export</h3>
          <p className="hint">Copies every lead as CSV so you can paste it into a spreadsheet.</p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={exportCsv}><Icon as={I.CopySimple} /> Copy all leads as CSV</button>
        </div>
      </div>

      {session.authRequired && (
        <div className="card">
          <div className="group-title"><h3>Session</h3></div>
          <div className="actions"><button className="btn btn-secondary" onClick={onLogout}><Icon as={I.SignOut} /> Log out</button></div>
        </div>
      )}
    </>
  );
}
