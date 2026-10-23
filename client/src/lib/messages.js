// All outgoing copy lives here. Honesty rules:
//  - never claim a site is already built (the pitch offers to build a demo after a yes)
//  - never hide that this is a small remote studio (quick reply says Pakistan plainly)
//  - no link in the first DM

export const PROBLEMS = {
  outdated: 'Outdated site',
  down: 'Site down',
  parked: 'Parked domain',
  nosite: 'No website',
  social: 'Social only',
};

export const PROBLEM_PRIORITY = { down: 0, parked: 0, nosite: 1, social: 1, outdated: 2 };

export const hasLink = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

export const firstName = (owner) => String(owner || '').trim().split(/\s+/)[0] || '';

export const domainOf = (site) => {
  const s = String(site || '').trim();
  if (!s) return 'your website';
  try {
    return new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, '');
  } catch {
    return s;
  }
};

export const money = (v) => {
  const s = String(v || '').trim();
  if (!s) return '[set price in Settings]';
  return /^\d/.test(s) ? `$${s}` : s;
};

const greeting = (lead) => {
  const f = firstName(lead.owner);
  return f ? `Hi ${f}!` : 'Hi!';
};

const problemSentence = (lead) => {
  switch (lead.problem) {
    case 'down':
      return `I tried opening ${domainOf(lead.site)} and it wasn't loading for me, so anyone clicking from Facebook or Google hits a dead end and may book someone else.`;
    case 'parked':
      return "Your website link currently lands on a 'get this domain' page, so anyone clicking it hits a dead end instead of your rentals.";
    case 'nosite':
      return "I noticed you don't have a website yet, so people searching on Google can't find you, and customers have to message you to see items or ask about dates.";
    case 'social':
      return "Your regular posts look great, but without a website they disappear from the feed after a day or two, and customers can't see your full lineup or check dates in one place.";
    case 'outdated':
    default:
      return "I took a look at your website and it feels a bit dated, and customers can't check dates or book online, so they probably end up messaging you for every inquiry.";
  }
};

const benefitLine = (lead) => {
  switch (lead.problem) {
    case 'down':
      return 'A working site means people clicking from Facebook or Google land on your rentals instead of a dead end.';
    case 'parked':
      return 'A real site on your link means anyone who clicks it lands on your rentals instead of a dead end.';
    case 'nosite':
      return 'A simple site with a gallery lets people find you on Google and see your lineup without messaging you first.';
    case 'social':
      return 'A site keeps your full lineup in one place, so customers can browse and check dates without scrolling through old posts.';
    case 'outdated':
    default:
      return 'Online date-checking and booking means customers can see what is open and request it without messaging you for every inquiry.';
  }
};

const hookLine = (lead) => {
  const hook = String(lead.hook || '').trim().replace(/[.!\s]+$/, '');
  return hook ? `I came across ${lead.name} and love ${hook}.` : `I came across ${lead.name} and like what you offer.`;
};

const PITCH_TAIL =
  "I run a small web design studio and I'd love to build you a free demo of a modern website with a gallery and online booking, and send it over within the hour of you saying yes. It's private, no cost, no obligation. Want me to put one together?";

export function buildMessage(stage, lead, config) {
  const hi = greeting(lead);
  switch (stage.key) {
    case 'pitch':
      return `${hi}\n\n${hookLine(lead)} ${problemSentence(lead)}\n\n${PITCH_TAIL}`;
    case 'fu1':
      return `${hi} Just floating my message back to the top in case it got buried. I'm still happy to put together that free private demo for ${lead.name} whenever you're ready, no pressure. Want me to build one?`;
    case 'fu2':
      return `${hi} One quick thought on why I reached out: ${benefitLine(lead)} The free demo is still on offer if you're curious, and it's private with no obligation.`;
    case 'fu3':
      return `${hi} Last note from me, I don't want to clutter your inbox. If a new website ever makes sense for ${lead.name}, just say the word and I'll build the free demo. Either way, I wish you a great season!`;
    case 'reply':
      return `${hi} Thanks so much for getting back to me! To make the demo feel like ${lead.name}, would it be okay if I use a few photos from your page in a private demo? Only you would see it, and I'll remove any photo you'd rather I didn't use. If you prefer, you can also send me a few of your favorites directly.`;
    case 'demo':
      return `${hi} Thanks again for the go-ahead! Here's the private demo I built for ${lead.name}: ${String(lead.demoLink || '').trim()}\n\nOnly you have this link, and everything is easy to change: photos, wording, prices, whatever you'd like different. If you want it live, it's ${money(config.setupPrice)} setup + ${money(config.monthlyPrice)}/month. No hard feelings if it's not for you.`;
    case 'nudge1':
      return `${hi} Quick check: did the demo link open okay for you? Happy to adjust anything you spot.`;
    case 'nudge2':
      return `${hi} What would make the demo an easy yes for you? I'm happy to change the layout, wording or prices, and I can remove any photo you'd rather not have in there.`;
    case 'nudge3':
      return `${hi} Last note from me on the demo, no pressure at all. If you'd like it live, just reply 'go live' and I'll take care of it. If not, no hard feelings.`;
    default:
      return '';
  }
}

const BASE_SUBJECT = (lead) => `A free website demo for ${lead.name}`;

export function emailSubject(stage, lead) {
  switch (stage.key) {
    case 'pitch':
      return BASE_SUBJECT(lead);
    case 'demo':
      return `Your private demo for ${lead.name}`;
    case 'nudge1':
    case 'nudge2':
    case 'nudge3':
      return `Re: Your private demo for ${lead.name}`;
    default:
      return `Re: ${BASE_SUBJECT(lead)}`;
  }
}

export function emailFooter(config) {
  const lines = [config.yourName, config.studio, config.address].map((s) => String(s || '').trim()).filter(Boolean);
  return `\n\n--\n${lines.join('\n')}${lines.length ? '\n\n' : ''}If you'd rather not hear from me, just reply "unsubscribe" and I won't email you again.`;
}

export const toEmailText = (stage, lead, config, body) =>
  `Subject: ${emailSubject(stage, lead)}\n\n${body}${emailFooter(config)}`;

export const hasPlaceholder = (text) => /\[[^\]]+\]/.test(text);

// ---- stages: which message is next for a lead, and what sending it does -------------------

const STEP_LABELS = {
  pitch: 'New DM · pitch',
  fu1: 'Follow-up 1 of 3',
  fu2: 'Follow-up 2 of 3',
  fu3: 'Follow-up 3 of 3 · last',
  reply: 'Replied · photo permission',
  replyWait: 'Replied · build the demo',
  demo: 'Demo delivery',
  nudge1: 'Demo nudge 1 of 3',
  nudge2: 'Demo nudge 2 of 3',
  nudge3: 'Demo nudge 3 of 3 · last',
};

const stage = (key, logTrack, logStep, sendable = true) => ({
  key, label: STEP_LABELS[key], logTrack, logStep, sendable, isNew: key === 'pitch',
});

/** The message a lead is waiting on, or null when its sequence is finished. */
export function getStage(lead) {
  if (lead.status === 'replied') {
    if (hasLink(lead.demoLink)) return stage('demo', 'demo', 0);
    const handled = lead.lastSentAt && lead.repliedAt && lead.lastSentAt >= lead.repliedAt;
    return handled ? stage('replyWait', 'reply', 0, false) : stage('reply', 'reply', 0);
  }
  if (lead.status === 'queued') return stage('pitch', 'cold', 0);
  if (lead.status === 'active') {
    if (lead.track === 'demo') {
      return lead.step >= 1 && lead.step <= 3 ? stage(`nudge${lead.step}`, 'demo', lead.step) : null;
    }
    if (lead.step <= 0) return stage('pitch', 'cold', 0);
    return lead.step <= 3 ? stage(`fu${lead.step}`, 'cold', lead.step) : null;
  }
  return null;
}

/** Field changes that "Mark sent" applies to the lead. */
export function applySend(lead, st, account, nowIso) {
  const patch = { account: account || lead.account || 'A', lastSentAt: nowIso };
  const next = (lead.step || 0) + 1;
  switch (st.key) {
    case 'pitch':
      return { ...patch, track: 'cold', step: 1, status: 'active' };
    case 'fu1': case 'fu2': case 'fu3':
    case 'nudge1': case 'nudge2': case 'nudge3':
      return { ...patch, step: next, status: next >= 4 ? 'done' : 'active' };
    case 'demo':
      return { ...patch, track: 'demo', step: 1, status: 'active', demoLink: String(lead.demoLink).trim() };
    case 'reply':
    default:
      return patch;
  }
}

// ---- quick replies -----------------------------------------------------------------------

export function quickReplies(config) {
  const studio = String(config.studio || '').trim();
  const studioName = studio ? `my studio, ${studio},` : 'my studio';
  return [
    {
      title: 'How much?',
      text: `The demo is free. If you like it and want it live, it's ${money(config.setupPrice)} setup + ${money(config.monthlyPrice)}/month. No obligation either way.`,
    },
    {
      title: 'Where are you based?',
      text: `Full transparency: I run a small, remote web design studio, and ${studioName} is based in Pakistan. I work with US businesses online, so everything happens over DM and email. The demo is free, so you can judge the work before deciding anything.`,
    },
    {
      title: 'Is it free?',
      text: `The demo is completely free and private, with no obligation. You only pay if you love it and want it live: ${money(config.setupPrice)} setup + ${money(config.monthlyPrice)}/month.`,
    },
    {
      title: 'Examples?',
      text: "Rather than show you someone else's site, I'd like to build one for your business so you can judge it with your own name, photos and rentals. That's what the free demo is. Want me to put one together?",
    },
    {
      title: 'What do you need from me?',
      text: "Just a yes, and permission to use a few photos from your page in a private demo. If you have a price list, service area or hours you'd like shown, send them over, but it's not required. I'll message you the private link once it's ready.",
    },
    {
      title: 'Not interested',
      text: "No problem at all, thanks for letting me know! I won't message again. Wishing you a great season!",
    },
  ];
}
