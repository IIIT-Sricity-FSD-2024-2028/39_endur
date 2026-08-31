// The pools of written comments used by the seed.
// Real sentences, not generated text: the comment list is the part of a results screen people actually read.
// Several pools per tone so nothing repeats down a column, and a separate vocabulary per industry.

export type Tone = 'positive' | 'mixed' | 'negative';

type Pools = Record<Tone, string[]>;

const university: Pools = {
  positive: [
    'The worked examples in the second half made everything click.',
    'Clear explanations and the pace was right for me.',
    'The lab sessions were the most useful part of the whole term.',
    'Feedback on the assignments came back quickly and was actually specific.',
    'I liked that the slides went up before the session rather than after.',
    'Genuinely enjoyed this one. The optional reading was worth doing.',
    'Office hours were easy to get to and never felt rushed.',
  ],
  mixed: [
    'Good content, but the first three weeks moved much faster than the rest.',
    'The material is solid. The assessment brief could be clearer.',
    'I learned a lot, though the group work was hard to coordinate.',
    'Lectures were fine; the recordings were often late going up.',
    'Strong start, but it lost momentum around the middle of the term.',
    'Useful overall. More practice questions would help.',
  ],
  negative: [
    'The workload was far heavier than the credit suggests.',
    'I was never sure what was actually being assessed.',
    'The slides were dense and hard to follow without the recording.',
    'Too much of the term was spent on one topic.',
    'Questions in the sessions rarely got a straight answer.',
    'The deadlines all landed in the same week as everything else.',
  ],
};

const hotel: Pools = {
  positive: [
    'Check-in took two minutes and the room was ready early.',
    'The staff remembered our name after the first morning.',
    'Spotless room, and the bed was genuinely comfortable.',
    'Breakfast had real variety and kept going long enough for a slow start.',
    'They sorted a late checkout without making it feel like a favour.',
    'Quiet room despite being right in the middle of town.',
  ],
  mixed: [
    'Lovely room, but the corridor noise carried at night.',
    'Great location. The wifi dropped a few times in the evening.',
    'Staff were friendly; the wait at breakfast was long on the Saturday.',
    'Comfortable stay overall, though the shower took a while to warm up.',
    'Good value. The room was smaller than the photos suggested.',
  ],
  negative: [
    'Our room was not ready until well after the time we were promised.',
    'The air conditioning ran loudly all night and could not be turned down.',
    'Nobody answered the phone at reception twice.',
    'The bathroom had not been cleaned properly.',
    'We were moved rooms twice without much explanation.',
  ],
};

const hospital: Pools = {
  positive: [
    'Everything was explained to me in language I could follow.',
    'The nurses checked on me without my having to ask.',
    'I always knew who was looking after me that day.',
    'Someone came quickly every time I used the call button.',
    'The discharge instructions were written down as well as said.',
  ],
  mixed: [
    'The care was good; the ward was very noisy at night.',
    'Staff were kind, but I saw a different doctor most days.',
    'I was well looked after. The food was hard to manage.',
    'Things were explained, though usually only when I asked first.',
  ],
  negative: [
    'I waited a long time and nobody told me why.',
    'I was not sure what was happening next in my treatment.',
    'The ward was too hot and I could not sleep.',
    'I had to repeat my history to four different people.',
  ],
};

const company: Pools = {
  positive: [
    'Priorities are clear and they do not change every week.',
    'My one-to-ones actually happen, and they are useful.',
    'I get told when something goes well, not only when it does not.',
    'Decisions get explained rather than just announced.',
    'I have enough context to make calls without escalating everything.',
  ],
  mixed: [
    'Good support, but there are too many meetings to get deep work done.',
    'Direction is clear at the team level and vague above it.',
    'Feedback is useful when it comes; it comes rarely.',
    'The work is interesting. The tooling slows everything down.',
  ],
  negative: [
    'Priorities change often enough that finishing anything is hard.',
    'I find out about decisions that affect me after they are made.',
    'The workload has not been sustainable for a while now.',
    'I do not know what I am being measured on.',
  ],
};

const generic: Pools = {
  positive: [
    'Straightforward and easy to deal with.',
    'Everything worked the way I expected it to.',
    'Quick, clear and no fuss.',
  ],
  mixed: [
    'Mostly good, with a couple of rough edges.',
    'Fine overall, though it took longer than I thought.',
  ],
  negative: [
    'It took several attempts to get what I needed.',
    'I was not sure who to ask when something went wrong.',
  ],
};

export const COMMENT_POOLS: Record<string, Pools> = {
  university,
  hotel,
  hospital,
  company,
  custom: generic,
};

export const poolFor = (industry: string, tone: Tone): string[] =>
  (COMMENT_POOLS[industry] ?? generic)[tone];
