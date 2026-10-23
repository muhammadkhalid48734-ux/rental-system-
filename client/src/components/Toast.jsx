import { useEffect } from 'react';

function Toast({ t, dismiss }) {
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.ms);
    return () => clearTimeout(id);
  }, [t.id, t.ms, dismiss]);

  return (
    <div className={`toast ${t.kind || ''}`}>
      <span>{t.msg}</span>
      {t.action && (
        <button
          className="btn small"
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

export default function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
