import { fmtLongDate } from '../lib/dates.js';

const TABS = [
  ['today', 'Today'],
  ['leads', 'Leads'],
  ['replies', 'Quick replies'],
  ['settings', 'Settings'],
];

function Meter({ cls, label, title, value, max, full }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`meter ${cls} ${full ? 'full' : ''}`}>
      <div className="meter-top">
        <span className="meter-label" title={title || label}>{label}</span>
        <span className="meter-val">{value}/{max}</span>
      </div>
      <div className="meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Header({ now, meters, cfg, tab, setTab, theme, cycleTheme, onRefresh, busy }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <div className="head-row">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </span>
            <div>
              <h1>Outreach Desk</h1>
              <div className="head-date mono">{fmtLongDate(now)}</div>
            </div>
          </div>
          <div className="head-tools">
            <button className="btn small" onClick={onRefresh} disabled={busy} aria-label="Refresh from Google Sheets">Refresh</button>
            <button className="btn small" onClick={cycleTheme} aria-label={`${theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'} theme, click to change`}>
              {theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
        <div className="meters" aria-label="Today's progress">
          <Meter cls="a" label="Account A new" title={`Account A new DMs today (${cfg.accA || 'Account A'})`} value={meters.A.used} max={meters.A.cap} full={meters.A.used >= meters.A.cap} />
          <Meter cls="b" label="Account B new" title={`Account B new DMs today (${cfg.accB || 'Account B'})`} value={meters.B.used} max={meters.B.cap} full={meters.B.used >= meters.B.cap} />
          <Meter cls="f" label="Follow-ups sent" value={meters.followups.sent} max={meters.followups.total} />
        </div>
        <div className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="panel"
              className="tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
