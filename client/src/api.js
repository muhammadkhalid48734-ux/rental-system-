async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const api = {
  leads: () => req('GET', '/api/leads').then((r) => r.leads),
  config: () => req('GET', '/api/config').then((r) => r.config),
  log: () => req('GET', '/api/log').then((r) => r.log),
  createLeads: (leads) => req('POST', '/api/leads', { leads }),
  patchLead: (id, patch) => req('PATCH', `/api/leads/${encodeURIComponent(id)}`, patch),
  deleteLead: (id) => req('DELETE', `/api/leads/${encodeURIComponent(id)}`),
  saveConfig: (config) => req('PUT', '/api/config', config).then((r) => r.config),
  addLog: (entry) => req('POST', '/api/log', entry),
};
