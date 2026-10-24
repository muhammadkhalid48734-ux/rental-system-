let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/login') onUnauthorized();
    const path = url.replace(/id=[0-9a-f-]{36}/g, 'id=<id>');
    const fallback = res.status === 404
      ? `The server did not recognise ${method} ${path} (HTTP 404, no JSON answer). The deployment may be out of date or misrouted: redeploy and check the Vercel function logs.`
      : `Request failed (${res.status})`;
    const err = new Error(json.error || fallback);
    err.status = res.status;
    err.code = json.code;
    err.retryAfterMs = json.retryAfterMs;
    err.detail = json.detail;
    throw err;
  }
  return json;
}

export const api = {
  session: () => req('GET', '/api/session'),
  login: (password) => req('POST', '/api/login', { password }),
  logout: () => req('POST', '/api/logout', {}),
  leads: () => req('GET', '/api/leads').then((r) => r.leads),
  config: () => req('GET', '/api/config').then((r) => r.config),
  log: () => req('GET', '/api/log').then((r) => r.log),
  createLeads: (leads) => req('POST', '/api/leads', { leads }),
  patchLead: (id, patch) => req('PATCH', `/api/leads?id=${encodeURIComponent(id)}`, patch),
  deleteLead: (id) => req('DELETE', `/api/leads?id=${encodeURIComponent(id)}`),
  saveConfig: (config) => req('PUT', '/api/config', config).then((r) => r.config),
  addLog: (entry) => req('POST', '/api/log', entry),
  generate: (body) => req('POST', '/api/generate', body),
};
