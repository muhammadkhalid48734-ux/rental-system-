import { useMemo, useState } from 'react';
import { PROBLEMS } from '../lib/messages.js';
import { pipelineStats } from '../lib/schedule.js';
import { I, Icon } from './icons.jsx';
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
      <h2 className="sr-only">Leads</h2>
      <div className="stats" role="group" aria-label="Pipeline">
        <div className="stat"><b>{stats.leads}</b><span>Leads</span></div>
        <div className="stat"><b>{stats.contacted}</b><span>Contacted</span></div>
        <div className="stat"><b>{stats.replied}</b><span>Replied</span></div>
        <div className="stat"><b>{stats.rate}%</b><span>Reply rate</span></div>
        <div className="stat"><b>{stats.won}</b><span>Won</span></div>
      </div>

      <div className="toolbar">
        <div className="input-icon">
          <Icon as={I.MagnifyingGlass} />
          <input type="search" placeholder="Search name, city, owner, note" aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={onAdd}><Icon as={I.Plus} /> Add lead</button>
        <button className="btn btn-secondary" onClick={onImport}><Icon as={I.UploadSimple} /> Import</button>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? 'All' : s}<span className="num">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <span className="icon-wrap"><Icon as={I.Tray} size="xl" /></span>
          <h2>{leads.length ? 'No leads match' : 'No leads yet'}</h2>
          <p>{leads.length ? 'Try a different search or status filter.' : 'Add a lead by hand, or paste rows from your spreadsheet with Import.'}</p>
          {leads.length === 0 && <button className="btn btn-secondary" onClick={onImport}><Icon as={I.UploadSimple} /> Import rows</button>}
        </div>
      ) : (
        <div className="rows">
          {shown.map((lead) => {
            const open = openId === lead.id;
            return (
              <div className="lead-row-wrap" key={lead.id}>
                <button className="lead-row" aria-expanded={open} onClick={() => setOpenId(open ? null : lead.id)}>
                  <div>
                    <span className="nm">{lead.name}</span>
                    <span className="ct">{[lead.city, lead.owner].filter(Boolean).join(' · ') || 'No city yet'}</span>
                  </div>
                  <div className="badges">
                    <span className={`tag tag-${lead.problem}`}>{PROBLEMS[lead.problem]}</span>
                    {lead.account && <span className={`acct ${lead.account === 'B' ? 'acct-B' : ''}`}><span aria-hidden="true">{lead.account}</span><span className="sr-only">Account {lead.account}</span></span>}
                    <span className={`tag ${lead.status === 'won' ? 'tag-ok' : lead.status === 'lost' ? 'tag-bad' : lead.status === 'replied' ? 'tag-info' : ''}`}>{lead.status}{lead.step ? ` ${lead.step}/4` : ''}</span>
                    <Icon as={open ? I.CaretDown : I.CaretRight} />
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
