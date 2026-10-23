import { fmtTime } from '../lib/dates.js';
import Hero from './Hero.jsx';
import LeadCard from './LeadCard.jsx';

function Section({ id, title, dot, note, count, hot, empty, children }) {
  return (
    <section className="section" id={id} aria-label={title}>
      <div className="section-title">
        <span className="dot" style={{ '--dot': dot }} aria-hidden="true" />
        <h2>{title}</h2>
        <span className={`count ${hot && count > 0 ? 'hot' : ''}`}>{count}</span>
        {note && <span className="sub-note">{note}</span>}
      </div>
      {count === 0 ? <div className="empty">{empty}</div> : children}
    </section>
  );
}

const CHANNEL = { ig: 'Instagram', fb: 'Facebook', email: 'Email' };
const clear = (text) => (<><span className="tick" aria-hidden="true">✓</span><span>{text}</span></>);

export default function Today({ today, week, now, env, leadCount }) {
  const { cfg } = env;
  const { replies, followups, newDMs, sentToday, remaining, queuedTotal, progress } = today;
  const limitHit = remaining.A + remaining.B === 0;
  const later = queuedTotal - newDMs.length;

  return (
    <>
      <Hero progress={progress} week={week} name={cfg.yourName} now={now} />

      <div className="notice" role="note">
        Follow-ups and replies also count toward each account's daily volume, so watch the total, not just the new-DM meters.
        This app never sends anything: it copies the message, opens the profile, and records what you send.
      </div>

      <Section id="sec-replies" title="Replies to handle" dot="var(--accent)" note="Answer these first" count={replies.length} hot
        empty={clear('No replies waiting. Use “They replied” in a card’s More menu when someone answers.')}>
        {replies.map((lead) => <LeadCard key={lead.id} lead={lead} env={env} />)}
      </Section>

      <Section id="sec-followups" title="Follow-ups due" dot="var(--warn)" note="Most overdue first" count={followups.length}
        empty={clear('No follow-ups due today.')}>
        {followups.map(({ lead }) => <LeadCard key={lead.id} lead={lead} env={env} />)}
      </Section>

      <Section
        id="sec-new"
        title="New DMs"
        dot="var(--acc-a)"
        note="Down / parked sites first"
        count={newDMs.length}
        empty={
          limitHit
            ? clear(`Daily limit reached for both accounts (${cfg.cap} each). New DMs unlock tomorrow.`)
            : leadCount === 0
              ? <span>No leads yet. Add or import some in the Leads tab.</span>
              : <span>No queued leads left. Add or import more in the Leads tab.</span>
        }
      >
        {newDMs.map(({ lead, account }) => <LeadCard key={lead.id} lead={lead} env={env} defaultAccount={account} />)}
        {later > 0 && <p className="hint">{later} more queued lead{later === 1 ? '' : 's'} waiting for open daily slots.</p>}
      </Section>

      <Section id="sec-sent" title="Sent today" dot="var(--ok)" count={sentToday.length} empty={<span>Nothing sent yet today. The first one is the hardest.</span>}>
        <div className="rows">
          {sentToday.map((r, i) => {
            const label = r.track === 'reply' ? 'Reply' : r.track === 'demo' ? (r.step === 0 ? 'Demo' : `Demo nudge ${r.step}`) : r.step === 0 ? 'Pitch' : `Follow-up ${r.step}`;
            return (
              <div className="sent-row" key={`${r.leadId}-${r.timestamp}-${i}`}>
                <div>
                  <span className="done" aria-hidden="true">✓</span><b>{r.lead?.name || 'Deleted lead'}</b>
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
