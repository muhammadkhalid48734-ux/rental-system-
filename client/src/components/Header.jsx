import { useEffect, useRef } from 'react';
import { fmtLongDate } from '../lib/dates.js';
import { I, Icon } from './icons.jsx';

const TABS = [
  ['today', 'Today', I.ListChecks],
  ['leads', 'Leads', I.Users],
  ['replies', 'Quick replies', I.ChatCircleText],
  ['settings', 'Settings', I.Gear],
];

const THEME = { auto: ['Auto', I.CircleHalf], light: ['Light', I.Sun], dark: ['Dark', I.Moon] };

function AcctPill({ letter, name, used, cap }) {
  const full = used >= cap;
  return (
    <div className={`acct-pill ${letter === 'B' ? 'b' : ''}`} title={`Account ${letter} new DMs today (${name || `Account ${letter}`})`}>
      <span className="acct" aria-hidden="true">{letter}</span>
      <span className="sr-only">Account {letter} new DMs today: </span>
      <span className="num">{used}/{cap}</span>
      {full && <span className="full">full</span>}
    </div>
  );
}

function Shortcuts({ open, onToggle, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); ref.current?.querySelector('button')?.focus(); } };
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-hdr btn-icon" aria-expanded={open} aria-controls="shortcuts-panel" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onToggle}>
        <Icon as={I.Keyboard} />
      </button>
      {open && (
        <div className="popover" id="shortcuts-panel" role="region" aria-label="Keyboard shortcuts">
          <h2>Keyboard shortcuts</h2>
          <dl className="keys">
            <dt><kbd aria-label="Up arrow"><Icon as={I.ArrowUp} size="sm" /></kbd><kbd aria-label="Down arrow"><Icon as={I.ArrowDown} size="sm" /></kbd></dt>
            <dd>Move through the queue</dd>
            <dt><kbd>C</kbd></dt>
            <dd>Copy the message</dd>
            <dt><kbd>?</kbd></dt>
            <dd>Show or hide this list</dd>
          </dl>
          <p className="hint">Shortcuts work when you are not typing in a field. Marking a message as sent is always a click.</p>
        </div>
      )}
    </div>
  );
}

export default function Header({ now, tasks, meters, cfg, tab, setTab, theme, cycleTheme, onRefresh, busy, shortcutsOpen, setShortcutsOpen }) {
  const ref = useRef(null);

  // Sticky UI must not cover the focused control: publish the header height for scroll-padding and the queue pane.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pct = tasks.total ? tasks.done / tasks.total : 0;
  const [themeLabel, ThemeIcon] = THEME[theme];

  return (
    <header className="app-header" ref={ref}>
      <div className="hdr-inner">
        <div className="brand">
          <span className="logo" aria-hidden="true"><Icon as={I.Check} size="lg" /></span>
          <div>
            <h1>Outreach Desk</h1>
            <div className="date num">{fmtLongDate(now)}</div>
          </div>
        </div>

        <div className="hdr-progress">
          <div className="progress-block">
            <div className="progress-label">
              <span>
                <span className="num">{tasks.total ? `${tasks.done} of ${tasks.total}` : '0'}</span>{' '}
                tasks today
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Tasks done today (new DMs and follow-ups)"
              aria-valuemin={0}
              aria-valuemax={tasks.total}
              aria-valuenow={tasks.done}
              aria-valuetext={`${tasks.done} of ${tasks.total} tasks done today`}
            >
              <div className="progress-fill" style={{ transform: `scaleX(${pct})` }} />
            </div>
          </div>
          <div className="accts" role="group" aria-label="New DMs sent today per account">
            <AcctPill letter="A" name={cfg.accA} used={meters.A.used} cap={meters.A.cap} />
            <AcctPill letter="B" name={cfg.accB} used={meters.B.used} cap={meters.B.cap} />
          </div>
        </div>

        <div className="hdr-tools">
          <button className="btn btn-hdr btn-icon" onClick={onRefresh} disabled={busy} aria-label="Refresh from Google Sheets" title="Refresh from Google Sheets">
            <Icon as={I.ArrowsClockwise} />
          </button>
          <button className="btn btn-hdr btn-icon" onClick={cycleTheme} aria-label={`Theme: ${themeLabel}. Click to change`} title={`Theme: ${themeLabel}`}>
            <Icon as={ThemeIcon} />
          </button>
          <Shortcuts open={shortcutsOpen} onToggle={() => setShortcutsOpen(!shortcutsOpen)} onClose={() => setShortcutsOpen(false)} />
        </div>

        <div className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label, Glyph]) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="panel"
              className="tab"
              onClick={() => setTab(id)}
            >
              <Icon as={Glyph} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
