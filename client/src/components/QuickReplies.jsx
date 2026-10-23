import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { quickReplies } from '../lib/messages.js';

export default function QuickReplies({ cfg, toast }) {
  const items = quickReplies(cfg);
  const [done, setDone] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (q) => copyText(q.text).then((ok) => {
    if (!ok) return toast('Copy failed. Select the text and copy manually.', { kind: 'bad' });
    setDone(q.title);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 1600);
    return undefined;
  });

  return (
    <>
      <p className="hint">Answers to the questions you will get most. Prices and studio details come from Settings.</p>
      {items.map((q) => (
        <article className="card qr" key={q.title}>
          <div className="card-head">
            <h3 className="biz">{q.title}</h3>
            <button className={`btn small ${done === q.title ? 'flash' : ''}`} onClick={() => copy(q)}>
              {done === q.title ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p>{q.text}</p>
        </article>
      ))}
    </>
  );
}
