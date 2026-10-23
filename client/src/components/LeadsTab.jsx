import { useMemo, useState } from 'react';
import { PROBLEMS } from '../lib/messages.js';
import { pipelineStats } from '../lib/schedule.js';
import LeadCard from './LeadCard.jsx';

const STATUSES = ['all', 'queued', 'active', 'replied', 'won', 'lost', 'done'];

export default function LeadsTab({ leads, env, onAdd, onImport }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [openId, setOpenId] = useState(null);
  const stats = useMemo(() => pipelineStats(leads), [leads]);

  const counts = useMemo(() => {
    const c = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [leads]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads
      .filter((l) => status === 'all' || l.status === status)
      .filter((l) => !needle || [l.name, l.city, l.owner, l.note, l.email].some((v) => String(v || '').toLowerCase().includes(needle)))
      .sort((a, b) => a.order - b.order);
  }, [leads, q, status]);

  return (
    <>
      <div className="stats" aria-label="Pipeline">
        <div className="stat"><b>{stats.leads}</b><span>Leads</span></div>
        <div className="stat"><b>{stats.contacted}</b><span>Contacted</span></div>
        <div className="stat"><b>{stats.replied}</b><span>Replied</span></div>
        <div className="stat"><b>{stats.rate}%</b><span>Reply rate</span></div>
        <div className="stat"><b>{stats.won}</b><span>Won</span></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search name, city, owner, note…" aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={onAdd}>Add lead</button>
        <button className="btn" onClick={onImport}>Import</button>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? 'All' : s}<span className="n">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">{leads.length ? 'No leads match this filter.' : 'No leads yet. Add one or paste rows from your sheet with Import.'}</div>
      ) : (
        <div className="rows">
          {shown.map((lead) => {
            const open = openId === lead.id;
            return (
              <div className="row-wrap" key={lead.id}>
                <button className="row" aria-expanded={open} onClick={() => setOpenId(open ? null : lead.id)}>
                  <div>
                    <span className="nm">{lead.name}</span>
                    <span className="ct">{[lead.city, lead.owner].filter(Boolean).join(' · ') || 'No city yet'}</span>
                  </div>
                  <div className="badges">
                    <span className={`badge prob-${lead.problem}`}>{PROBLEMS[lead.problem]}</span>
                    {lead.account && <span className={`badge acc-${lead.account}`}>{lead.account}</span>}
                    <span className="badge mono">{lead.status}{lead.step ? ` ${lead.step}/4` : ''}</span>
                  </div>
                </button>
                {open && <LeadCard lead={lead} env={env} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
