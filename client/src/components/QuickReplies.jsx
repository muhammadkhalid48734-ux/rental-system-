import { copyText } from '../lib/clipboard.js';
import { quickReplies } from '../lib/messages.js';

export default function QuickReplies({ cfg, toast }) {
  const items = quickReplies(cfg);
  const copy = (text) => copyText(text).then((ok) => toast(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy manually.', ok ? {} : { kind: 'bad' }));

  return (
    <>
      <p className="hint">Answers to the questions you will get most. Prices and studio details come from Settings.</p>
      {items.map((q) => (
        <article className="card qr" key={q.title}>
          <div className="card-head">
            <h3 className="biz">{q.title}</h3>
            <button className="btn small" onClick={() => copy(q.text)}>Copy</button>
          </div>
          <p>{q.text}</p>
        </article>
      ))}
    </>
  );
}
