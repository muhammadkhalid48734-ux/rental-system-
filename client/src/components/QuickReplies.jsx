import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { plans, quickReplies, recommendReply, RECOMMENDED_PLAN } from '../lib/messages.js';
import { I, Icon } from './icons.jsx';

function CopyButton({ id, text, label, done, copy }) {
  return (
    <button className={done === id ? 'btn btn-flash' : 'btn btn-secondary'} onClick={() => copy(id, text)} aria-label={`Copy reply: ${label}`}>
      <Icon as={done === id ? I.Check : I.CopySimple} /> {done === id ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function QuickReplies({ cfg, toast }) {
  const [plan, setPlan] = useState(RECOMMENDED_PLAN);
  const items = quickReplies(cfg);
  const [done, setDone] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (id, text) => copyText(text).then((ok) => {
    if (!ok) return toast('Copy failed. Select the text and copy it by hand.', { kind: 'bad' });
    setDone(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 1600);
    return undefined;
  });

  return (
    <>
      <div className="group-title">
        <h2>Quick replies</h2>
        <p className="hint">Answers to the questions you will get most. Plan names and prices come from Settings.</p>
      </div>
      {items.map((q) => (
        <article className="card qr-card" key={q.title}>
          <div className="card-title">
            <h3>{q.title}</h3>
            {!q.parts && <CopyButton id={q.title} text={q.text} label={q.title} done={done} copy={copy} />}
          </div>
          {q.parts ? (
            <div className="stack">
              {q.parts.map((part) => {
                const text = part.plan ? recommendReply(cfg, plan) : part.text;
                const id = `${q.title}:${part.label}`;
                return (
                  <div className="qr-part" key={part.label}>
                    <div className="card-title">
                      <h4>{part.label}</h4>
                      <CopyButton id={id} text={text} label={`${q.title}, ${part.label}`} done={done} copy={copy} />
                    </div>
                    {part.plan && (
                      <div className="seg" role="group" aria-label="Plan to recommend">
                        {plans(cfg).map((p) => (
                          <button key={p.n} aria-pressed={plan === p.n} onClick={() => setPlan(p.n)}>{p.name || `Plan ${p.n}`}</button>
                        ))}
                      </div>
                    )}
                    <p>{text}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>{q.text}</p>
          )}
        </article>
      ))}
    </>
  );
}
