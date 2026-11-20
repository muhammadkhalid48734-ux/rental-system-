import { useMemo } from 'react';
import { SOURCES } from '../lib/messages.js';
import { NO_SOURCE, trackingStats } from '../lib/schedule.js';

const COLS = [
  ['sent', 'DMs sent'],
  ['replied', 'Replied'],
  ['demo', 'Demo sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
];

function StatsTable({ title, label, rows }) {
  return (
    <div className="card">
      <div className="group-title"><h3>{title}</h3></div>
      {rows.length === 0 ? (
        <p className="hint">No leads yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">{label}</th>
                <th scope="col" className="num">Leads</th>
                {COLS.map(([k, h]) => <th scope="col" className="num" key={k}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td className="num">{r.leads}</td>
                  {COLS.map(([k]) => <td className="num" key={k}>{r[k]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Stats({ leads }) {
  const { byCity, bySource } = useMemo(() => trackingStats(leads), [leads]);
  const sources = bySource.map((r) => ({ ...r, name: r.name === NO_SOURCE ? r.name : SOURCES[r.name] || r.name }));
  return (
    <>
      <div className="group-title">
        <h2>Stats</h2>
        <p className="hint">
          Per city and per source. DMs sent counts leads past their first message (step 1 or more, or no longer queued);
          replied counts leads with a reply date; demo sent counts leads on the demo track.
        </p>
      </div>
      <div className="stack">
        <StatsTable title="By city" label="City" rows={byCity} />
        <StatsTable title="By source" label="Source" rows={sources} />
      </div>
    </>
  );
}
