// The engine's DATA. 43 § The engine, DEC-042.
//
// Kept apart from `engine.ts` on purpose: this file is a list of English words and it is
// the half that will need tuning, while the arithmetic next door will not. Anyone
// improving the analysis edits this file; nobody needs to read the other one.
//
// It is also the honest statement of what rule-based means. A lexicon knows that "broken"
// is bad and "excellent" is good. It does not know that "wifi" and "internet" are the same
// thing, and it will not learn. `43` § Reliability is the answer to that, and it is a
// better answer than a confident wrong theme.

/**
 * Stop-words. Function words plus the verbs and hedges that appear in every second
 * sentence of written feedback and cluster with nothing.
 *
 * Deliberately NOT domain words. "Room", "food", "parking", "delivery" are exactly the
 * themes we are looking for; an organisation-specific stop list would be configuration,
 * and nobody has asked for it.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'able', 'about', 'above', 'after', 'again', 'against', 'all', 'almost', 'also',
  'although', 'always', 'am', 'among', 'an', 'and', 'another', 'any', 'anyone', 'anything',
  'are', 'around', 'as', 'at', 'away', 'back', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'came', 'can', 'cannot', 'come', 'could', 'did',
  'do', 'does', 'doing', 'done', 'down', 'during', 'each', 'either', 'else', 'enough',
  'even', 'ever', 'every', 'everyone', 'everything', 'few', 'for', 'from', 'further', 'get',
  'gets', 'getting', 'give', 'given', 'go', 'goes', 'going', 'got', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'however', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'keep', 'kind',
  'know', 'last', 'least', 'less', 'let', 'like', 'lot', 'made', 'make', 'makes', 'making',
  'many', 'may', 'maybe', 'me', 'might', 'mine', 'more', 'most', 'much', 'must', 'my',
  'myself', 'need', 'needs', 'never', 'next', 'no', 'nor', 'not', 'nothing', 'now', 'of',
  'off', 'often', 'on', 'once', 'one', 'only', 'or', 'other', 'others', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'per', 'perhaps', 'put', 'quite', 'rather',
  'really', 'said', 'same', 'say', 'says', 'see', 'seem', 'seems', 'seen', 'she', 'should',
  'since', 'so', 'some', 'someone', 'something', 'sometimes', 'still', 'such', 'sure',
  'take', 'taken', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'therefore', 'these', 'they', 'thing', 'things', 'think', 'this', 'those',
  'though', 'through', 'thus', 'time', 'to', 'together', 'too', 'took', 'toward', 'try',
  'under', 'until', 'up', 'upon', 'us', 'use', 'used', 'using', 'usually', 'very', 'want',
  'wanted', 'was', 'way', 'we', 'well', 'went', 'were', 'what', 'when', 'where', 'whether',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'within', 'without', 'would',
  'yet', 'you', 'your', 'yours', 'yourself',

  // --- ADDED 2026-08-25, FROM REAL SEEDED COMMENTS, NOT FROM A WORD LIST.
  //
  // The engine's first run over The Grand Palace's 229 comments returned `Twice` and
  // `Dropped` as themes, sitting in the table beside `Checkout` and `Breakfast`. They come
  // from real sentences — "we were moved rooms twice", "the wifi dropped a few times" — and
  // the words are genuinely frequent. They are simply not TOPICS: nobody clicks through to
  // "the comments mentioning twice".
  //
  // Generic verbs and adverbs, then. Domain nouns stay out of this list on purpose, which
  // is the line the block above draws too: `room`, `parking` and `breakfast` are what we
  // are hunting for. Stemming means one entry covers the inflections — `drop` catches
  // `dropped` and `dropping`.
  'twice', 'instead', 'anyway', 'somewhat', 'fairly', 'overall', 'throughout', 'meanwhile',
  'afterwards', 'alongside', 'regarding', 'apart', 'aside', 'along', 'across', 'behind',
  'beside', 'beyond', 'despite', 'except', 'unless', 'whereas', 'whenever', 'wherever',
  'whatever', 'whoever', 'far', 'near', 'soon', 'ago', 'yesterday', 'today', 'tomorrow',
  'everywhere', 'somewhere', 'anywhere', 'plus', 'bit',
  'drop', 'turn', 'move', 'run', 'carry', 'answer', 'feel', 'felt', 'look', 'find', 'found',
  'gave', 'told', 'tell', 'ask', 'call', 'leave', 'left', 'stay', 'arrive', 'happen',
  'become', 'became', 'bring', 'brought', 'send', 'sent', 'show', 'shown', 'start', 'stop',
  'end', 'begin', 'began', 'appear', 'remain', 'stand', 'walk', 'talk', 'speak', 'spoke',
  'hear', 'heard', 'read', 'write', 'wrote', 'work',
  // Second pass, from Northfield / Riverside / Meridian rather than from The Grand Palace.
  // Bare adjectives and durations. `night`, `morning` and `evening` are deliberately NOT
  // here: "noise carried at night" is a real complaint about a real time of day.
  'actually', 'genuinely', 'explain', 'check', 'useful', 'interesting', 'long', 'short',
  'deep', 'big', 'small', 'high', 'low', 'new', 'full', 'whole', 'real', 'main',
  'day', 'week', 'month', 'year', 'hour', 'minute',
]);

/**
 * A word within this many tokens BEFORE a sentiment word flips its sign. "not clean" is
 * not a compliment, and a lexicon that scores it as one is worse than no lexicon: it gets
 * the direction wrong on exactly the comments that matter most.
 *
 * Negators are themselves stop-words, so this is measured on the RAW token stream. That is
 * the reason `tokenise()` keeps both streams instead of only the filtered one.
 */
export const NEGATORS: ReadonlySet<string> = new Set([
  'not', 'no', 'never', 'none', 'nothing', 'nobody', 'nowhere', 'neither', 'nor',
  'cannot', 'cant', 'wont', 'dont', 'doesnt', 'didnt', 'isnt', 'wasnt', 'arent', 'werent',
  'hardly', 'barely', 'scarcely', 'without', 'lacks', 'lacking', 'rarely', 'seldom',
]);

export const NEGATION_WINDOW = 3;

/**
 * Sentiment weights, written in PLAIN ENGLISH. `engine.ts` puts this map through the same
 * `stem()` the comments go through, so `delayed`, `delays` and `delaying` all reach the one
 * entry for `delay` and nobody has to know what the stemmer does.
 *
 * Hand-stemmed entries were the first version and they are a trap: they drift away from
 * whatever the stemmer actually does, silently, and the failure looks like a word that
 * simply never scores. Variants that stem APART — `love`/`loved`, `smell`/`smelly` — are
 * listed twice on purpose, which is cheap and is visible.
 *
 * Weights are -2..+2 and the twos are reserved for words that carry the whole sentence:
 * "excellent", "terrible", "useless". Everything else is a one, because a lexicon that
 * fine-tunes 1.3 against 1.7 is pretending to a precision it does not have.
 */
export const SENTIMENT: ReadonlyMap<string, number> = new Map([
  // --- strong positive (+2): the word carries the whole sentence on its own
  ['excellent', 2], ['outstanding', 2], ['superb', 2], ['fantastic', 2], ['brilliant', 2],
  ['perfect', 2], ['wonderful', 2], ['amazing', 2], ['exceptional', 2], ['flawless', 2],
  ['delightful', 2], ['delighted', 2], ['love', 2], ['loved', 2], ['impeccable', 2],

  // --- positive (+1)
  ['good', 1], ['great', 1], ['nice', 1], ['help', 1], ['helped', 1], ['helpful', 1],
  ['clear', 1], ['clean', 1], ['friendly', 1], ['comfortable', 1], ['quick', 1],
  ['fast', 1], ['easy', 1], ['smooth', 1], ['pleasant', 1], ['pleased', 1], ['polite', 1],
  ['welcoming', 1], ['warm', 1], ['fresh', 1], ['tidy', 1], ['spacious', 1], ['quiet', 1],
  ['reliable', 1], ['prompt', 1], ['efficient', 1], ['thorough', 1], ['patient', 1],
  ['support', 1], ['supportive', 1], ['engaging', 1], ['informative', 1], ['informed', 1],
  ['organised', 1], ['organized', 1], ['improved', 1], ['improvement', 1],
  ['recommend', 1], ['enjoyed', 1], ['enjoyable', 1], ['appreciate', 1], ['impressed', 1],
  ['impressive', 1], ['convenient', 1], ['valuable', 1], ['generous', 1], ['attentive', 1],
  ['professional', 1], ['knowledgeable', 1], ['approachable', 1], ['fair', 1],
  ['solid', 1], ['worth', 1], ['happy', 1], ['satisfied', 1], ['satisfying', 1],
  ['best', 1], ['better', 1], ['smile', 1], ['smiling', 1], ['calm', 1], ['modern', 1],
  ['bright', 1], ['tasty', 1], ['delicious', 1], ['gracious', 1], ['seamless', 1],

  // --- negative (-1)
  ['bad', -1], ['poor', -1], ['slow', -1], ['late', -1], ['dirty', -1], ['cold', -1],
  ['rude', -1], ['noisy', -1], ['noise', -1], ['crowded', -1], ['cramped', -1],
  ['smell', -1], ['smelly', -1], ['stained', -1], ['dusty', -1], ['old', -1],
  ['outdated', -1], ['expensive', -1], ['overpriced', -1], ['confusing', -1],
  ['confused', -1], ['unclear', -1], ['difficult', -1], ['boring', -1], ['bored', -1],
  ['dull', -1], ['weak', -1], ['messy', -1], ['disorganised', -1], ['disorganized', -1],
  ['delayed', -1], ['delay', -1], ['waiting', -1], ['queue', -1], ['ignored', -1],
  ['unhelpful', -1], ['unfriendly', -1], ['uncomfortable', -1], ['inconsistent', -1],
  ['unreliable', -1], ['lacking', -1], ['missing', -1], ['problem', -1], ['issue', -1],
  ['faulty', -1], ['error', -1], ['mistake', -1], ['complaint', -1], ['complain', -1],
  ['disappointing', -1], ['disappointed', -1], ['frustrating', -1], ['frustrated', -1],
  ['annoying', -1], ['annoyed', -1], ['stressful', -1], ['stressed', -1], ['tiring', -1],
  ['tired', -1], ['rushed', -1], ['crash', -1], ['crashes', -1], ['freezes', -1],
  ['stuck', -1], ['unfair', -1], ['worse', -1], ['worst', -1], ['sad', -1], ['angry', -1],
  ['upset', -1], ['cancelled', -1], ['canceled', -1], ['ignoring', -1],

  // --- strong negative (-2)
  ['terrible', -2], ['awful', -2], ['horrible', -2], ['appalling', -2], ['useless', -2],
  ['unacceptable', -2], ['disgusting', -2], ['dreadful', -2], ['abysmal', -2],
  ['hate', -2], ['broken', -2], ['broke', -2], ['break', -2], ['failed', -2],
  ['failure', -2], ['nightmare', -2], ['atrocious', -2], ['humiliating', -2],
]);
