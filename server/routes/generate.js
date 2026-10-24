import { Router } from 'express';
import { buildMessage, hasLink, packages } from '../../client/src/lib/messages.js';
import { rowToLead } from '../schema.js';
import { HttpError, ah } from '../util.js';
import { earlierMessages } from '../history.js';
import { KINDS, buildSystemPrompt, buildUserPrompt } from '../prompts.js';
import { assembleDemo, cleanOutput, validateDemoFinal, validateDraft } from '../validate.js';
import { LlmError } from '../llm.js';
import { readConfig } from './config.js';

const STAGE_BY_KIND = {
  cold: 'pitch', followup1: 'fu1', followup2: 'fu2', followup3: 'fu3',
  demo: 'demo', demoNudge1: 'nudge1', demoNudge2: 'nudge2', demoNudge3: 'nudge3', replyAck: 'reply',
};

const MAX_ATTEMPTS = 2;
const BUDGET_MS = 45000; // stay well inside the 60s function limit; past this, fall back to the template

const cleanHint = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);

function cleanVariants(v) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 8) throw new HttpError(400, 'previousVariants must be an array of at most 8 texts');
  return v.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.slice(0, 1500)).slice(-5);
}

export function generateRouter({ store, llm, queue, env = process.env, now = () => Date.now(), random = Math.random }) {
  const r = Router();

  r.post('/', ah(async (req, res) => {
    const { leadId, kind } = req.body || {};
    if (typeof leadId !== 'string' || !leadId) throw new HttpError(400, 'leadId is required');
    if (!KINDS.includes(kind)) throw new HttpError(400, `kind must be one of: ${KINDS.join(', ')}`);
    const hint = cleanHint(req.body.hint);
    const previousVariants = cleanVariants(req.body.previousVariants);

    // The server loads everything itself, so the client can never inject lead data or instructions.
    const row = (await store.getRows('Leads')).find((x) => x[0] === leadId);
    if (!row) throw new HttpError(404, 'Lead not found');
    const lead = rowToLead(row);
    if (kind === 'demo' && !hasLink(lead.demoLink)) throw new HttpError(400, 'Paste the demo link on the lead first.');
    const config = await readConfig(store);
    if (kind === 'demo' && packages(config).some((p) => !p.name || !p.setup)) {
      throw new HttpError(400, 'Fill in all three package names and setup prices in Settings first.');
    }
    if (!env.GROQ_API_KEY) throw new LlmError('not_configured', 'AI personalization is off: GROQ_API_KEY is not set on the server.');

    const earlier = await earlierMessages(store, leadId);
    const started = now();
    let violation = '';
    let reason = '';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0 && now() - started > BUDGET_MS - 15000) break;
      const user = buildUserPrompt({
        kind, lead, config, earlier, hint, previousVariants, violation,
        variation: Math.floor(random() * 1000),
      });
      let draft;
      try {
        draft = cleanOutput(await queue.run(() => llm.generate({ system: buildSystemPrompt(config), user }, { env })));
      } catch (err) {
        if (err instanceof LlmError && err.code === 'bad_output') {
          violation = 'the answer was empty or cut off';
          reason = violation;
          continue;
        }
        throw err;
      }

      let problems = validateDraft(kind, draft, config);
      let text = draft;
      if (!problems.length && kind === 'demo') {
        text = assembleDemo(draft, lead, config);
        problems = validateDemoFinal(text, lead, config);
      }
      if (!problems.length) {
        return res.json({ text, source: 'personalized', pace: queue.nextSlotIn() });
      }
      violation = problems.join('; ');
      reason = violation;
    }

    const text = buildMessage({ key: STAGE_BY_KIND[kind] }, lead, config);
    return res.json({ text, source: 'template', reason, pace: queue.nextSlotIn() });
  }));

  return r;
}
