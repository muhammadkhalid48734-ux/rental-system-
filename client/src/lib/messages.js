// All outgoing copy lives here. Honesty rules:
//  - never claim a site is already built (the pitch offers to build a demo after a yes)
//  - never hide that this is a small remote studio (quick reply says Pakistan plainly)
//  - no link, no price and no delivery-time promise in any DM

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
  const s = String(v ?? '').trim().replace(/^\$/, '');
  return s ? `$${s}` : '';
};

// ---- plans (names and prices come only from Config; the website build is free) --------------

/** Bump this whenever the system prompt or the offline templates change in a way that makes old drafts stale. */
export const PROMPT_VERSION = 2;

export const RECOMMENDED_PLAN = 2;

export const TERMS_LINE = 'The website build is free. 3-month minimum, then cancel anytime. Your domain, photos and text always belong to you.';

const cleanPrice = (v) => String(v ?? '').trim().replace(/^\$/, '');

export const foundingOn = (config) => String(config.foundingOffer ?? '').toLowerCase() === 'true';

export function plans(config) {
  return [1, 2, 3].map((n) => ({
    n,
    name: String(config[`plan${n}Name`] || '').trim(),
    price: cleanPrice(config[`plan${n}Price`]),
    founding: cleanPrice(config[`plan${n}Founding`]),
    note: String(config[`plan${n}Note`] || '').trim(),
    recommended: n === RECOMMENDED_PLAN,
  }));
}

/** "$59/month", or with the founding offer on "$39/month for the first year, then $59/month". */
export function planPrice(p, config) {
  const regular = `${money(p.price)}/month`;
  return foundingOn(config) && p.founding ? `${money(p.founding)}/month for the first year, then ${regular}` : regular;
}

/** Every dollar amount a pricing reply may legitimately contain. */
export function allowedAmounts(config) {
  const set = new Set();
  for (const p of plans(config)) {
    if (p.price) set.add(Number(p.price));
    if (p.founding) set.add(Number(p.founding));
  }
  return set;
}

// ---- hook: one true detail from their page, shown in the message ---------------------------

export const HOOK_MAX_WORDS = 12;
export const GENERIC_HOOK_WORDS = ['great', 'amazing', 'best', 'wonderful', 'awesome', 'fantastic', 'excellent', 'incredible', 'perfect', 'lovely', 'nice'];

export const hookWordCount = (hook) => String(hook || '').trim().split(/\s+/).filter(Boolean).length;

/** Generic praise words found in a hook (it should be a concrete detail, not a compliment). */
export function genericHookWords(hook) {
  const words = String(hook || '').toLowerCase().match(/[a-z']+/g) || [];
  return GENERIC_HOOK_WORDS.filter((w) => words.includes(w));
}

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

const hookLine = (lead) => {
  const hook = String(lead.hook || '').trim().replace(/[.!\s]+$/, '');
  return hook ? `I came across ${lead.name} and noticed ${hook}.` : `I came across ${lead.name} and like what you offer.`;
};

const pitchTail = () =>
  "I run a small web design studio and I'd be glad to build you a free demo of a modern site with a gallery and a booking request form. No obligation. Want me to put one together?";

export const REPLY_ENDING = "You'll have it shortly.";
export const DEMO_CLOSING = "If you'd like to know how it works and what it costs, just ask.";

// config is accepted for call-site compatibility; the offline templates no longer read it (no prices, no timing).
export function buildMessage(stage, lead) {
  const hi = greeting(lead);
  switch (stage.key) {
    case 'pitch':
      return `${hi}\n\n${hookLine(lead)} ${problemSentence(lead)}\n\n${pitchTail()}`;
    case 'fu1':
      return `${hi} Just bringing my message back up in case it got buried. I'm still happy to build a free demo for ${lead.name}, no pressure at all. Want me to put one together?`;
    case 'fu2':
      return `${hi} One more reason I reached out: with a booking request form, customers can send their date and item without messaging you first, so your DMs stay for real conversations. The free demo for ${lead.name} is still on offer. Would you like to see it?`;
    case 'fu3':
      return `${hi} I won't keep filling your inbox, so this is my last note. If a website ever becomes useful for ${lead.name}, you know where to find me. Wishing you a great season!`;
    case 'reply':
      return `${hi} Thanks so much for getting back to me! To make the demo feel like ${lead.name}, would it be okay if I use a few photos from your page in a private demo? Only you would see it, and I'll remove any photo you'd rather I didn't use. If you prefer, you can also send me a few of your favorites directly. ${REPLY_ENDING}`;
    case 'demo':
      return `${hi} Thanks again for the go-ahead! Here's the private demo I built for ${lead.name}: ${String(lead.demoLink || '').trim()}\n\nOnly you have this link, and nothing is public. The calendar and the form in this version are for show, so you can see the layout. Tell me what to change: colors, wording, items, prices or photos.\n\n${DEMO_CLOSING}`;
    case 'nudge1':
      return `${hi} Quick check: did the demo link open okay on your phone? Happy to change anything you spot.`;
    case 'nudge2':
      return `${hi} Is there anything that would make you say yes to the demo? I can swap photos, change items or prices, and remove any photo you'd rather not have in it.`;
    case 'nudge3':
      return `${hi} Last note from me on the demo. I'll keep it available a few more days, and if you'd like it live, just reply "go live". If not, no hard feelings.`;
    default:
      return '';
  }
};

const BASE_SUBJECT = (lead) => `A free demo for ${lead.name}`;

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

/** Step 2 of "How much?": recommend one plan, with the terms line, and mention the cheaper and the fuller plan. */
export function recommendReply(config, n = RECOMMENDED_PLAN) {
  const all = plans(config);
  const pick = all.find((p) => p.n === n) || all[RECOMMENDED_PLAN - 1];
  const cheaper = all.find((p) => p.n === pick.n - 1);
  const fuller = all.find((p) => p.n === pick.n + 1);
  const also = [
    cheaper && `${cheaper.name} is ${planPrice(cheaper, config)} if you'd like to start smaller`,
    fuller && `${fuller.name} is ${planPrice(fuller, config)} if you want more built in`,
  ].filter(Boolean);
  return `Thanks! From what you've told me, I'd suggest ${pick.name} at ${planPrice(pick, config)}. ${pick.note}\n\n${TERMS_LINE}${also.length ? `\n\nFor comparison: ${also.join(', and ')}.` : ''}`;
}

export function quickReplies(config) {
  const studio = String(config.studio || '').trim();
  const studioName = studio ? ` (${studio})` : '';
  const all = plans(config);
  const first = all[0];
  const startsAt = foundingOn(config) && first.founding
    ? `${money(first.founding)}/month for the first year (${money(first.price)}/month after)`
    : `${money(first.price)}/month`;
  return [
    {
      title: 'How much?',
      parts: [
        { label: 'Step 1 · Ask first', text: "Happy to help with that! So I can point you to the right option, roughly how many items do you rent out, and how do bookings come in right now (DMs, calls, texts)?" },
        { label: 'Step 2 · Recommend a plan', plan: true, text: recommendReply(config) },
        { label: 'If they ask the price before the demo', text: `Plans start at ${startsAt} and the website build is free. The demo is free and you pay nothing unless you want it live.` },
      ],
    },
    {
      title: 'Is it really free?',
      text: `The demo is free and there's no obligation. The website build is free too. You only pay the monthly plan if you decide to go live, and plans start at ${startsAt} with a 3-month minimum, then cancel anytime. Your domain, photos and text always belong to you.`,
    },
    {
      title: 'What do you need from me?',
      text: 'Just your business name, the area you serve, your items and prices if you have them, and your OK to use a few photos from your page for the demo only. It stays private.',
    },
    {
      title: 'Where are you based?',
      text: `Full transparency: I run a small, remote web design studio${studioName} based in Pakistan. I work with US businesses online, so everything happens over DM and email. I'm happy to jump on a video call or send my portfolio if you'd like to see more.`,
    },
    {
      title: 'Do I own the site?',
      text: "You own your domain, photos and text, always. The site itself runs on my hosting while you're a customer, and if you ever stop I send you your site files.",
    },
    {
      title: 'Facebook is enough',
      text: "Facebook is great for showing your work, and I'd keep using it! A website adds what Facebook can't: people searching on Google can find you, they see your whole lineup in one place, and a booking request form lets them send their date and item without messaging you first, so your DMs stay for real conversations. The demo is free, so you can compare the two.",
    },
    {
      title: 'Too expensive',
      text: `Totally understand. My smallest plan, ${first.name}, is ${planPrice(first, config)}. ${TERMS_LINE} The demo is free too, so you can see it with your own photos before deciding anything.`,
    },
    {
      title: "I'll think about it",
      text: "Of course, no rush! The demo is free and you pay nothing unless you want it live, so there's nothing to decide yet. If there's anything you'd want changed, tell me and I'll adjust it.",
    },
    {
      title: 'How do reviews work?',
      text: "After a rental, every customer gets the link to your Google reviews. There's no filtering, so happy and unhappy customers get the same link, and we never pay for reviews. Real reviews from real customers are what build trust with new ones.",
    },
    {
      title: 'How does double-booking protection work?',
      text: "A date is blocked when you confirm a booking or when the deposit arrives. Pending requests don't block the date, so a request that never turns into a booking can't lock you out. If you prefer, you can set a 24-hour hold so a pending request holds the date for 24 hours.",
    },
    {
      title: 'What if I stop?',
      text: "After the 3-month minimum you can cancel anytime. If you stop, we send you your site files, and your domain, photos and text stay yours.",
    },
    {
      title: 'Not interested',
      text: "No problem at all, thanks for letting me know! I won't message again. Wishing you a great season!",
    },
  ];
}
