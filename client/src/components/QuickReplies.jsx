import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { quickReplies } from '../lib/messages.js';
import { I, Icon } from './icons.jsx';

export default function QuickReplies({ cfg, toast }) {
  const items = quickReplies(cfg);
  const [done, setDone] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (q) => copyText(q.text).then((ok) => {
    if (!ok) return toast('Copy failed. Select the text and copy it by hand.', { kind: 'bad' });
    setDone(q.title);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 1600);
    return undefined;
  });

  return (
    <>
      <div className="group-title">
        <h2>Quick replies</h2>
        <p className="hint">Answers to the questions you will get most. Prices, the demo delivery time and studio details come from Settings.</p>
      </div>
      {items.map((q) => (
        <article className="card qr-card" key={q.title}>
          <div className="card-title">
            <h3>{q.title}</h3>
            <button className={done === q.title ? 'btn btn-flash' : 'btn btn-secondary'} onClick={() => copy(q)} aria-label={`Copy reply: ${q.title}`}>
              <Icon as={done === q.title ? I.Check : I.CopySimple} /> {done === q.title ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p>{q.text}</p>
        </article>
      ))}
    </>
  );
}
