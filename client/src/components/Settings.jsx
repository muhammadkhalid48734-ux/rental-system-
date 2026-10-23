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
    title: 'Pricing',
    note: 'Used in the demo message and the quick replies.',
    fields: [
      ['setupPrice', 'Setup price', 'text', '$199'],
      ['monthlyPrice', 'Monthly price', 'text', '$29'],
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

export default function Settings({ config, leads, onSave, toast }) {
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

        <div className="card">
          <div className="group-title"><h3>Behavior</h3></div>
          <label className="check">
            <input type="checkbox" checked={form.autoMark === 'true'} onChange={set('autoMark')} />
            <span>
              Auto-mark as sent when I click “Copy + open Instagram/Facebook”
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                Off by default. If it is on, the lead moves on the moment you click, whether or not you actually sent the DM. You can still undo for 8 seconds.
              </span>
            </span>
          </label>
        </div>

        <div className="savebar">
          <span className="hint">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
          <button className="btn primary" type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>

      <div className="card">
        <div className="group-title">
          <h3>Export</h3>
          <p className="hint">Copies every lead as CSV so you can paste it into a spreadsheet.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={exportCsv}>Copy all leads as CSV</button>
        </div>
      </div>
    </>
  );
}
