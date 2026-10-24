import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { genCache } from './lib/genCache.js';
import { cacheKey } from './lib/gen.js';
import { applySend } from './lib/messages.js';
import { buildToday, parseConfig, weekStats } from './lib/schedule.js';
import Header from './components/Header.jsx';
import Today from './components/Today.jsx';
import LeadsTab from './components/LeadsTab.jsx';
import QuickReplies from './components/QuickReplies.jsx';
import Settings from './components/Settings.jsx';
import Toasts from './components/Toast.jsx';
import Login from './components/Login.jsx';
import { Confetti } from './components/Hero.jsx';
import { ImportDialog, LeadDialog } from './components/Dialogs.jsx';

const UNDO_MS = 8000;
const MIN_FOCUS_REFRESH_MS = 60000; // never reload more often than every 30s; focus reloads wait a full minute

const store = {
  get(k, d) {
    try { return localStorage.getItem(`outreach-desk:${k}`) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(`outreach-desk:${k}`, v); } catch { /* storage unavailable */ }
  },
};

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

export default function App() {
  const [tab, setTabState] = useState(() => store.get('tab', 'today'));
  const [theme, setTheme] = useState(() => store.get('theme', 'auto'));
  const [data, setData] = useState({ leads: [], config: null, log: [], loadedAt: new Date() });
  const [phase, setPhase] = useState('checking');
  const [session, setSession] = useState({ authRequired: false, llm: { configured: false, model: '' } });
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [burst, setBurst] = useState(0);
  const wasComplete = useRef(null);
  const lastLoad = useRef(0);
  const loadSeq = useRef(0);
  const toastId = useRef(0);

  const setTab = (t) => {
    setTabState(t);
    store.set('tab', t);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    store.set('theme', theme);
  }, [theme]);
  const cycleTheme = () => setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'));

  const dismiss = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((msg, opts = {}) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, msg, ms: 3500, ...opts }]);
    return id;
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [leads, config, log] = await Promise.all([api.leads(), api.config(), api.log()]);
      if (seq !== loadSeq.current) return; // a newer load started; don't let this older read overwrite it
      lastLoad.current = Date.now();
      setData({ leads, config, log, loadedAt: new Date() });
      setPhase('ready');
      setLoadError('');
    } catch (err) {
      if (err.status === 401) return; // the unauthorized handler already switched to the login screen
      setLoadError(err.message);
      setPhase((p) => (p === 'ready' ? p : 'error'));
      toast(`Could not reload: ${err.message}`, { kind: 'bad', ms: 6000 });
    }
  }, [toast]);

  // Check the session first, then read once; later reads happen after writes, via Refresh, or on tab focus.
  const start = useCallback(async () => {
    setPhase('checking');
    try {
      setSession(await api.session());
      setPhase('loading');
      await load();
    } catch (err) {
      if (err.status === 401) return;
      setLoadError(err.message);
      setPhase('error');
    }
  }, [load]);
  useEffect(() => {
    setUnauthorizedHandler(() => setPhase('login'));
    start();
  }, [start]);

  const logout = async () => {
    try { await api.logout(); } catch { /* cookie may already be gone */ }
    setData({ leads: [], config: null, log: [], loadedAt: new Date() });
    setPhase('login');
  };
  useEffect(() => {
    const onVisible = () => {
      const typing = document.activeElement && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName);
      if (document.visibilityState === 'visible' && !typing && Date.now() - lastLoad.current > MIN_FOCUS_REFRESH_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  /** Runs a write, then reloads. Errors become a toast. `quiet` skips the busy lock (for blur-time saves). */
  const run = useCallback(async (fn, { quiet = false } = {}) => {
    if (!quiet) setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      toast(err.message, { kind: 'bad', ms: 6000 });
      return false;
    } finally {
      await load();
      if (!quiet) setBusy(false);
    }
  }, [load, toast]);

  const cfg = useMemo(() => parseConfig(data.config || {}), [data.config]);
  const now = data.loadedAt;
  const today = useMemo(() => buildToday(data.leads, data.log, cfg, now), [data.leads, data.log, cfg, now]);
  const week = useMemo(() => weekStats(data.leads, data.log, now), [data.leads, data.log, now]);

  // Celebrate the moment today's list goes from "something left" to "all done" (not on first load).
  useEffect(() => {
    if (phase !== 'ready') return;
    if (wasComplete.current === false && today.progress.complete) setBurst((b) => b + 1);
    wasComplete.current = today.progress.complete;
  }, [phase, today.progress.complete]);

  const actions = {
    toast,
    edit: (lead) => setDialog({ type: 'edit', lead }),
    patch: (id, patch, msg, opts) => run(async () => {
      await api.patchLead(id, patch);
      if (msg) toast(msg);
    }, opts),
    send: (lead, stage, account, channel, demoLink, text) => run(async () => {
      const eff = demoLink !== undefined && lead.status === 'replied' ? { ...lead, demoLink } : lead;
      const patch = applySend(eff, stage, account, new Date().toISOString());
      const prev = pick(lead, Object.keys(patch));
      const entry = { leadId: lead.id, account: patch.account, track: stage.logTrack, step: stage.logStep };

      await api.patchLead(lead.id, patch);
      try {
        await api.addLog({ ...entry, channel, text });
      } catch (err) {
        await api.patchLead(lead.id, prev).catch(() => {});
        throw new Error(`Could not record the send, so it was not marked: ${err.message}`);
      }
      genCache.clear(cacheKey(eff, stage));

      toast(`Sent ✓ ${lead.name} · ${today.progress.sent + 1} done today`, {
        kind: 'good',
        ms: UNDO_MS,
        action: {
          label: 'Undo',
          run: () => run(async () => {
            await api.patchLead(lead.id, prev);
            await api.addLog({ ...entry, channel: 'undo' });
            toast('Undone');
          }),
        },
      });
    }),
  };

  const env = {
    cfg,
    busy,
    newBy: { A: today.meters.A.used, B: today.meters.B.used },
    llm: session.llm,
    actions,
  };

  const saveLead = async (form, existing) => {
    if (existing) {
      await api.patchLead(existing.id, form);
    } else {
      const res = await api.createLeads([form]);
      if (res.skipped.length) throw new Error(`“${form.name}” is already in your leads.`);
    }
    await load();
    toast(existing ? 'Lead saved' : 'Lead added');
  };

  const deleteLead = async (lead) => {
    await api.deleteLead(lead.id);
    await load();
    toast(`Deleted ${lead.name}`);
  };

  const importLeads = async (rows) => {
    const res = await api.createLeads(rows.map(({ dup, ...r }) => r));
    await load();
    toast(`Imported ${res.created.length} lead${res.created.length === 1 ? '' : 's'}${res.skipped.length ? `, skipped ${res.skipped.length} duplicate${res.skipped.length === 1 ? '' : 's'}` : ''}`);
  };

  const saveConfig = async (form) => {
    await api.saveConfig(form);
    await load();
  };

  if (phase === 'login') return <><Login onDone={start} /><Toasts toasts={toasts} dismiss={dismiss} /></>;

  if (phase === 'checking' || phase === 'loading') {
    return (
      <div className="fatal" aria-busy="true" aria-label="Loading">
        <h1>Outreach Desk</h1>
        <div className="skeleton">
          <div className="sk" style={{ height: 150 }} />
          <div className="sk" style={{ height: 220 }} />
          <div className="sk" style={{ height: 220 }} />
        </div>
        <p className="hint">Loading from Google Sheets…</p>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="fatal">
        <h1>Outreach Desk</h1>
        <div className="notice bad" role="alert">{loadError}</div>
        <p className="hint">Is the server running (<span className="mono">npm run dev</span>) and is <span className="mono">.env</span> filled in? See README.md.</p>
        <div className="actions"><button className="btn primary" onClick={start}>Try again</button></div>
        <Toasts toasts={toasts} dismiss={dismiss} />
      </div>
    );
  }

  return (
    <>
      <Header
        now={now} meters={today.meters} cfg={cfg} tab={tab} setTab={setTab}
        theme={theme} cycleTheme={cycleTheme} onRefresh={load} busy={busy}
      />
      <main className="wrap" id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'today' && <Today today={today} week={week} now={now} env={env} leadCount={data.leads.length} />}
        {tab === 'leads' && (
          <LeadsTab
            leads={data.leads} env={env}
            onAdd={() => setDialog({ type: 'add' })}
            onImport={() => setDialog({ type: 'import' })}
          />
        )}
        {tab === 'replies' && <QuickReplies cfg={cfg} toast={toast} />}
        {tab === 'settings' && <Settings key={JSON.stringify(data.config)} config={data.config} leads={data.leads} onSave={saveConfig} toast={toast} session={session} onLogout={logout} />}
      </main>

      {dialog?.type === 'add' && <LeadDialog onSave={(f) => saveLead(f, null)} onClose={() => setDialog(null)} />}
      {dialog?.type === 'edit' && (
        <LeadDialog
          lead={dialog.lead}
          onSave={(f) => saveLead(f, dialog.lead)}
          onDelete={deleteLead}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'import' && (
        <ImportDialog
          existingNames={data.leads.map((l) => l.name)}
          onImport={importLeads}
          onClose={() => setDialog(null)}
        />
      )}
      <Confetti burst={burst} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}
