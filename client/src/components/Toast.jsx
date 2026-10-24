import { useEffect } from 'react';
import { I, Icon } from './icons.jsx';

const ICON = { good: [I.CheckCircle, 'ok'], warn: [I.Warning, 'warn'], bad: [I.XCircle, 'bad'] };

function Toast({ t, dismiss }) {
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.ms);
    return () => clearTimeout(id);
  }, [t.id, t.ms, dismiss]);
  const [Glyph, tone] = ICON[t.kind] || [I.Info, ''];

  return (
    <div className="toast">
      <Icon as={Glyph} className={tone} />
      <span className="msg-text">{t.msg}</span>
      {t.action && (
        <button
          className="btn btn-sm"
          onClick={() => {
            dismiss(t.id);
            t.action.run();
          }}
        >
          {t.action.label}
        </button>
      )}
      {t.action && <i className="toast-bar" style={{ animationDuration: `${t.ms}ms` }} />}
    </div>
  );
}

// Toasts never take focus; the container announces them politely.
export default function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
