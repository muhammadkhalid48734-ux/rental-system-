import { useEffect, useMemo, useState } from 'react';

const R = 36;
const CIRC = 2 * Math.PI * R;

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ block: 'start' });

function headline({ progress, name, hour }) {
  const hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const who = name ? `, ${name.split(/\s+/)[0]}` : '';
  const { sent, left, goal, pct, complete } = progress;
  if (goal === 0) return { title: `${hi}${who}`, text: "Nothing queued yet. Add or import leads to build today's list." };
  if (complete) return { title: 'Daily goal smashed', text: `${sent} sent today. Take a break, you've earned it.` };
  if (sent === 0) return { title: `${hi}${who}`, text: `${left} to do today. Start with one DM: momentum beats perfection.` };
  if (pct < 50) return { title: 'Good start', text: `${left} to go. Keep the rhythm.` };
  return { title: 'Over halfway', text: `Only ${left} left. Finish strong.` };
}

export default function Hero({ progress, week, name, now }) {
  const { title, text } = headline({ progress, name, hour: now.getHours() });
  const { todo, pct, complete, goal } = progress;
  const chips = [
    ['sec-replies', todo.replies, 'Replies'],
    ['sec-followups', todo.followups, 'Follow-ups'],
    ['sec-new', todo.newDMs, 'New DMs'],
  ].filter(([, n]) => n > 0);

  return (
    <section className={`hero ${complete ? 'complete' : ''}`} aria-label="Daily progress">
      <div className="hero-main">
        <div className="ring" role="progressbar" aria-label="Today's tasks done" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <circle className="track" cx="42" cy="42" r={R} />
            <circle className="bar" cx="42" cy="42" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - (goal ? pct : 0) / 100)} />
          </svg>
          <div className="pct">{complete ? '✓' : `${pct}%`}</div>
        </div>
        <div className="hero-text">
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="hero-todo" aria-label="Jump to">
          {chips.map(([id, n, label]) => (
            <button key={id} className="todo-chip" onClick={() => scrollTo(id)}><b>{n}</b>{label}</button>
          ))}
        </div>
      )}

      <div className="hero-stats">
        <div><b>{week.streak > 1 ? `🔥 ${week.streak}d` : `${week.streak}d`}</b><span>Streak</span></div>
        <div><b>{week.sent}</b><span>Sent, 7 days</span></div>
        <div><b>{week.replies}</b><span>Replies, 7 days</span></div>
        <div><b>{week.won}</b><span>Won</span></div>
      </div>
    </section>
  );
}

const COLORS = ['#f2c14e', '#3ec4b5', '#8eaaf6', '#f2a36c', '#ff8f85', '#ffffff'];

export function Confetti({ burst }) {
  const [show, setShow] = useState(false);
  const pieces = useMemo(
    () => Array.from({ length: 44 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: COLORS[i % COLORS.length],
      rot: 360 + Math.random() * 540,
      dur: 1.9 + Math.random() * 1.1,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  );

  useEffect(() => {
    if (!burst) return undefined;
    setShow(true);
    const id = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(id);
  }, [burst]);

  if (!show) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--rot': `${p.rot}deg` }} />
      ))}
    </div>
  );
}
