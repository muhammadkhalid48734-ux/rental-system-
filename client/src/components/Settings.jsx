import { useState } from 'react';
import { copyText, leadsToCsv } from '../lib/clipboard.js';

const FIELDS = [
  ['accA', 'Account A name', 'text', 'e.g. @studio_one'],
  ['accB', 'Account B name', 'text', 'e.g. @studio_two'],
  ['cap', 'New DMs per account per day', 'number', ''],
  ['gaps', 'Follow-up gaps in days (after message 1, 2, 3)', 'text', '2,3,4'],
  ['setupPrice', 'Setup price', 'text', '$199'],
  ['monthlyPrice', 'Monthly price', 'text', '$29'],
  ['yourName', 'Your name', 'text', ''],
  ['studio', 'Studio name', 'text', ''],
];

export default function Settings({ config, leads, onSave, toast }) {
  const [form, setForm] = useState({ ...config });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      toast('Settings saved');
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
      <form className="card" onSubmit={save}>
        <div className="form-grid">
          {FIELDS.map(([key, label, type, ph]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input type={type} value={form[key] ?? ''} placeholder={ph} onChange={set(key)} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 100 : undefined} />
            </label>
          ))}
          <label className="field wide">
            <span>Postal address (added to the footer of “Copy as email”)</span>
            <input type="text" value={form.address ?? ''} placeholder="Street, city, country" onChange={set('address')} />
          </label>
          <label className="check wide">
            <input type="checkbox" checked={form.autoMark === 'true'} onChange={set('autoMark')} />
            <span>
              Auto-mark as sent when I click “Copy + open Instagram/Facebook”
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                Off by default. If it is on, the lead moves on the moment you click, whether or not you actually sent the DM. You can still undo for 8 seconds.
              </span>
            </span>
          </label>
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>

      <div className="card">
        <h3 className="biz">Export</h3>
        <p className="hint">Copies every lead as CSV so you can paste it into a spreadsheet.</p>
        <div className="actions">
          <button className="btn" onClick={exportCsv}>Copy all leads as CSV</button>
        </div>
      </div>
    </>
  );
}
