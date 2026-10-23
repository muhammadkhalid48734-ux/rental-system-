import { fmtTime } from '../lib/dates.js';
import LeadCard from './LeadCard.jsx';

function Section({ title, count, empty, children }) {
  return (
    <section className="section" aria-label={title}>
      <div className="section-title">
        <h2>{title}</h2>
        <span className="count">{count}</span>
      </div>
      {count === 0 ? <div className="empty">{empty}</div> : children}
    </section>
  );
}

const CHANNEL = { ig: 'Instagram', fb: 'Facebook', email: 'Email' };

export default function Today({ today, env, leadCount }) {
  const { cfg } = env;
  const { replies, followups, newDMs, sentToday, remaining, queuedTotal } = today;
  const limitHit = remaining.A + remaining.B === 0;
  const later = queuedTotal - newDMs.length;

  return (
    <>
      <div className="notice" role="note">
        Follow-ups and replies you send also count toward each account's daily volume, so keep an eye on the total, not just the new-DM meters.
        This app never sends anything: it copies the message, opens the profile, and records what you send.
      </div>

      <Section title="Replies to handle" count={replies.length} empty="No replies waiting. Use “They replied” in a card’s More menu when someone answers.">
        {replies.map((lead) => <LeadCard key={lead.id} lead={lead} env={env} />)}
      </Section>

      <Section title="Follow-ups due" count={followups.length} empty="No follow-ups due today.">
        {followups.map(({ lead }) => <LeadCard key={lead.id} lead={lead} env={env} />)}
      </Section>

      <Section
        title="New DMs"
        count={newDMs.length}
        empty={
          limitHit
            ? `Daily limit reached for both accounts (${cfg.cap} each). New DMs unlock tomorrow.`
            : leadCount === 0
              ? 'No leads yet. Add or import some in the Leads tab.'
              : 'No queued leads left. Add or import more in the Leads tab.'
        }
      >
        {newDMs.map(({ lead, account }) => <LeadCard key={lead.id} lead={lead} env={env} defaultAccount={account} />)}
        {later > 0 && <p className="hint">{later} more queued lead{later === 1 ? '' : 's'} waiting for open daily slots.</p>}
      </Section>

      <Section title="Sent today" count={sentToday.length} empty="Nothing sent yet today.">
        <div className="rows">
          {sentToday.map((r, i) => {
            const label = r.track === 'reply' ? 'Reply' : r.track === 'demo' ? (r.step === 0 ? 'Demo' : `Demo nudge ${r.step}`) : r.step === 0 ? 'Pitch' : `Follow-up ${r.step}`;
            return (
              <div className="sent-row" key={`${r.leadId}-${r.timestamp}-${i}`}>
                <div>
                  <b>{r.lead?.name || 'Deleted lead'}</b>
                  <div className="hint">{label} · {CHANNEL[r.channel] || r.channel}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge acc-${r.account}`}>{r.account}</span>
                  <div className="hint mono">{fmtTime(new Date(r.timestamp))}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
