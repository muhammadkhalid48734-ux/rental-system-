import path from 'node:path';
import { google } from 'googleapis';
import { LEAD_COLS, LOG_COLS, CONFIG_DEFAULTS } from './schema.js';

const TABS = { Leads: LEAD_COLS, Log: LOG_COLS, Config: ['key', 'value'] };

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const configRows = () => Object.entries(CONFIG_DEFAULTS);
const pad = (row, n) => Array.from({ length: n }, (_, i) => row[i] ?? '');

/**
 * Store interface (rows are arrays of strings, header excluded):
 *   init(), getRows(tab), appendRows(tab, rows), updateRow(tab, i, row), deleteRow(tab, i), replaceAll(tab, rows)
 */

export function googleStore({ spreadsheetId, keyFile }) {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyFile),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetIds = {};
  const width = (tab) => TABS[tab].length;
  const last = (tab) => colLetter(width(tab));

  async function loadSheetIds() {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
    for (const s of meta.data.sheets ?? []) sheetIds[s.properties.title] = s.properties.sheetId;
  }

  async function init() {
    await loadSheetIds();
    const missing = Object.keys(TABS).filter((t) => !(t in sheetIds));
    if (missing.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
      });
      await loadSheetIds();
    }
    for (const [tab, header] of Object.entries(TABS)) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:${last(tab)}1` });
      if (!res.data.values?.[0]?.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [header] },
        });
      }
    }
    if (!(await getRows('Config')).length) await appendRows('Config', configRows());
  }

  async function getRows(tab) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId, range: `${tab}!A2:${last(tab)}`, majorDimension: 'ROWS',
    });
    return (res.data.values ?? []).map((r) => pad(r, width(tab)));
  }

  async function appendRows(tab, rows) {
    if (!rows.length) return;
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `${tab}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  }

  async function updateRow(tab, index, row) {
    const n = index + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tab}!A${n}:${last(tab)}${n}`, valueInputOption: 'RAW', requestBody: { values: [row] },
    });
  }

  async function deleteRow(tab, index) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId: sheetIds[tab], dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 },
          },
        }],
      },
    });
  }

  async function replaceAll(tab, rows) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A2:${last(tab)}` });
    if (rows.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${tab}!A2`, valueInputOption: 'RAW', requestBody: { values: rows },
      });
    }
  }

  return { kind: 'google', init, getRows, appendRows, updateRow, deleteRow, replaceAll };
}

// In-memory store for demos and tests. Nothing is persisted.
export function memoryStore() {
  const data = { Leads: [], Log: [], Config: [] };
  return {
    kind: 'memory',
    async init() {
      if (!data.Config.length) data.Config = configRows();
    },
    async getRows(tab) {
      return data[tab].map((r) => pad(r, TABS[tab].length));
    },
    async appendRows(tab, rows) {
      data[tab].push(...rows.map((r) => pad(r, TABS[tab].length)));
    },
    async updateRow(tab, i, row) {
      data[tab][i] = row;
    },
    async deleteRow(tab, i) {
      data[tab].splice(i, 1);
    },
    async replaceAll(tab, rows) {
      data[tab] = rows.map((r) => [...r]);
    },
  };
}

export function createStore({ memory = false } = {}) {
  if (memory || process.env.STORAGE === 'memory') return memoryStore();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!spreadsheetId || !keyFile) {
    throw new Error(
      'Missing GOOGLE_SHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON in .env (see README.md). ' +
      'To try the app without Google Sheets run: npm run demo',
    );
  }
  return googleStore({ spreadsheetId, keyFile });
}
