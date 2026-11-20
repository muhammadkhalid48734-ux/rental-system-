// All outgoing copy lives here. Honesty rules:
//  - never claim a site is already built (the pitch offers to build a demo after a yes)
//  - never hide that this is a small remote studio (quick reply says Pakistan plainly)
//  - no link, no price and no delivery-time promise in any pre-demo DM
//  - the demo is a booking REQUEST form: the owner approves every request, nothing is booked without them
//  - the only prices are the ones in Config (the yes-reply price line and the pricing quick replies)

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
export const PROMPT_VERSION = 3;

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

/** "Plans start at" price: the founding price while the offer is on, else plan 1's monthly price. */
export function startsAt(config) {
  const first = plans(config)[0];
  return foundingOn(config) && first.founding
    ? `${money(first.founding)}/month for the first year (${money(first.price)}/month after)`
    : `${money(first.price)}/month`;
}

/**
 * Fixed line added to the yes-reply (after they say yes, before the demo). Built from Config only, never written
 * by the model, so the amount is always one of allowedAmounts(config).
 */
export const priceLine = (config) =>
  `Quick heads-up so there are no surprises: the demo is free, and if you decide to keep the site, plans start at ${startsAt(config)} (3-month minimum, then cancel anytime).`;

/**
 * Puts `line` in front of the closing question of `text` (its last sentence), so the message still ends with a
 * question. When the text does not end with a question the line goes at the end.
 */
export function insertBeforeQuestion(text, line) {
  const t = String(text).trim();
  if (!/\?\s*\p{Extended_Pictographic}?\s*$/u.test(t)) return `${t} ${line}`;
  // start of the last sentence: just after the last ., ! or ? (plus closing quotes) that is followed by a space
  let cut = 0;
  for (const m of t.matchAll(/[.!?…]["”')]?\s+/g)) {
    if (m.index + m[0].length < t.length) cut = m.index + m[0].length;
  }
  return cut === 0 ? `${line} ${t}` : `${t.slice(0, cut).trimEnd()} ${line} ${t.slice(cut)}`;
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
      return `I tried opening ${domainOf(lead.site)} and it wasn't loading, so parents clicking from Facebook or Google hit a dead end and may book someone else.`;
    case 'parked':
      return "Your website link currently lands on a 'get this domain' page, so anyone clicking it hits a dead end instead of your rentals.";
    case 'nosite':
      return "I noticed you don't have a website yet, so parents searching on Google can't find you or browse your rentals.";
    case 'social':
      return "Your posts look great, but without a website they slide down the feed, and parents can't see your full lineup in one place.";
    case 'outdated':
    default:
      return 'I took a look at your website on my phone and it could be easier for parents to browse your rentals.';
  }
};

const hookLine = (lead) => {
  const hook = String(lead.hook || '').trim().replace(/[.!\s]+$/, '');
  return hook ? `I came across ${lead.name} and noticed ${hook}.` : `I came across ${lead.name} and like what you offer.`;
};

export const APPROVAL_LINE = 'Nothing gets booked without you, you approve every request.';

const pitchTail = () =>
  `I run a small web design studio and could build you a free demo of a simple site where parents can see your rentals and send a booking request. ${APPROVAL_LINE} No obligation. Want me to put one together?`;

/** The demo message always ends with this question. */
export const DEMO_CLOSING = 'Which rental should be first on the page?';
export const DEMO_SAMPLE_LINE = 'Only you have this link. Photos and info are samples for now.';
export const demoVideoLine = (url) => `Here's a quick video of how a customer would send you a request: ${url}`;

/** The model's part of the yes-reply (no price). withPriceLine() adds the price line from Config. */
export const replyBody = (lead) =>
  `${greeting(lead)} Thanks so much for getting back to me! I'll only use photos from your page with your OK, and nothing goes live without your approval. To make the demo feel like ${lead.name}, what are your top 3 rentals?`;

/** The yes-reply as sent: the price line from Config goes right before the closing question. */
export const withPriceLine = (text, config) => insertBeforeQuestion(text, priceLine(config));

// config feeds the yes-reply price line; every other template ignores it (no prices, no timing).
export function buildMessage(stage, lead, config = {}) {
  const hi = greeting(lead);
  switch (stage.key) {
    case 'pitch':
      return `${hi}\n\n${hookLine(lead)} ${problemSentence(lead)}\n\n${pitchTail()}`;
    case 'fu1':
      return `${hi} Just bumping this in case it got buried. I'm still happy to make a free demo for ${lead.name}, no pressure at all. Want me to put one together?`;
    case 'fu2':
      return `${hi} One more thought: many parents search Google before they message anyone. A simple site with your rentals and a request form helps them find ${lead.name} and send their date and item, and you still approve every request. Want to see a free demo?`;
    case 'fu3':
      return `${hi} I won't keep filling your inbox, so this is my last note. If a website ever becomes useful for ${lead.name}, you know where to find me. Wishing you a great season!`;
    case 'reply':
      return withPriceLine(replyBody(lead), config);
    case 'demo': {
      const video = String(lead.demoVideo || '').trim();
      return [
        `${hi} Thanks again for the go-ahead! Here's the demo for ${lead.name}: ${String(lead.demoLink || '').trim()}`,
        DEMO_SAMPLE_LINE,
        video && demoVideoLine(video),
        DEMO_CLOSING,
      ].filter(Boolean).join('\n\n');
    }
    case 'nudge1':
      return `${hi} Did the demo open okay on your phone? Tell me which rental people ask about most and I'll put it first.`;
    case 'nudge2':
      return `${hi} Anything you'd change? I can swap photos, items, prices or colors, whatever makes it feel like yours.`;
    case 'nudge3':
      return `${hi} No pressure at all. Should I keep your demo saved for spring, or close it out? Either answer is fine.`;
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
      return {
        ...patch, track: 'demo', step: 1, status: 'active', demoLink: String(lead.demoLink).trim(),
        ...(lead.demoVideo ? { demoVideo: String(lead.demoVideo).trim() } : {}),
      };
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

/** Plans page link from Config (siteUrl), or '' when it is empty or not an http(s) link. */
export const siteUrlOf = (config) => (hasLink(config.siteUrl) ? String(config.siteUrl).trim() : '');

/**
 * "Go live": the three plans with their Config prices, then what you need from them. With the founding offer on,
 * the first-year prices are listed and the regular prices follow, so every amount still comes from Config.
 */
export function goLiveReply(config) {
  const [p1, p2, p3] = plans(config);
  const founding = foundingOn(config) && [p1, p2, p3].every((p) => p.founding);
  const price = (p) => money(founding ? p.founding : p.price);
  const after = founding ? ` for the first year (then ${money(p1.price)}, ${money(p2.price)} or ${money(p3.price)}/month)` : '';
  const url = siteUrlOf(config);
  return [
    'So glad you like it! To go live, just 3 things:',
    `1. Pick a plan: ${p1.name} ${price(p1)}, ${p2.name} ${price(p2)}, or ${p3.name} ${price(p3)}/month${after}${url ? ` (details: ${url})` : ''}`,
    '2. Your OK on the photos and text',
    '3. Your domain, or I can help you pick one (it stays in your name)',
    'Which plan feels right?',
  ].join('\n');
}

export function quickReplies(config) {
  const studio = String(config.studio || '').trim();
  const studioName = studio ? ` (${studio})` : '';
  const all = plans(config);
  const first = all[0];
  const from = startsAt(config);
  return [
    {
      title: 'How much?',
      parts: [
        { label: 'Step 1 · Ask first', text: "Happy to help with that! So I can point you to the right option, roughly how many items do you rent out, and how do bookings come in right now (DMs, calls, texts)?" },
        { label: 'Step 2 · Recommend a plan', plan: true, text: recommendReply(config) },
        { label: 'If they ask the price before the demo', text: `Plans start at ${from} and the website build is free. The demo is free and you pay nothing unless you want it live.` },
      ],
    },
    {
      title: 'Is it really free?',
      text: `The demo is free and there's no obligation. The website build is free too. You only pay the monthly plan if you decide to go live, and plans start at ${from} with a 3-month minimum, then cancel anytime. Your domain, photos and text always belong to you.`,
    },
    {
      title: "What's the catch?",
      text: `Fair question! The catch is simple: building the site is free, and if you want to keep it live, it's a monthly plan starting at ${from} (3-month minimum, then cancel anytime). If you don't like the demo, you pay nothing. Your domain, photos and text always stay yours.`,
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
      title: 'Go live',
      text: goLiveReply(config),
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
