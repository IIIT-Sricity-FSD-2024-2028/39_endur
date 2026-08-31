// The seed's acceptance list.
// These check the seed's INPUTS rather than a seeded database on purpose: they have to fail on the day
// somebody adds a sixth preset or an eleventh question, not on the day somebody remembers to run it.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRESET_LIST, presetFor } from '../presets/index.js';
import { TIERS, changeCostMinor, priceOf } from '@endur/shared';
import { DEMO_ORGS } from '../database/seed/demo.js';
import { COMMENT_POOLS } from '../database/seed/comments.js';
import { Rng, skewedRating } from '../database/seed/random.js';
import { historyFor } from '../database/seed/billing-history.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedRoot = path.resolve(backendRoot, '../../packages/shared/src');

describe('presets — 50 §1, §2', () => {
  it('ships exactly five', () => {
    expect(PRESET_LIST.map((preset) => preset.key)).toEqual([
      'university',
      'hotel',
      'hospital',
      'company',
      'custom',
    ]);
  });

  it('has no template over ten questions', () => {
    for (const preset of PRESET_LIST) {
      for (const template of preset.templates) {
        // Short forms are the product's whole idea, not a preference.
        expect(
          template.questions.length,
          `${preset.key} / ${template.name}`,
        ).toBeLessThanOrEqual(10);
      }
    }
  });

  it('ships at least one one-question pulse per preset', () => {
    for (const preset of PRESET_LIST) {
      // "A poll is a one-question template", demonstrated rather than argued.
      expect(
        preset.templates.some((template) => template.questions.length === 1),
        preset.key,
      ).toBe(true);
    }
  });

  it('gives every preset a working four-level structure and a full label set', () => {
    for (const preset of PRESET_LIST) {
      expect(preset.roles.length, preset.key).toBeGreaterThanOrEqual(2);
      // Custom is NOT blank: somebody who picks it and presses Continue four times must still end with
      // a working organisation.
      expect(preset.units.length, preset.key).toBeGreaterThanOrEqual(1);
      expect(preset.units.filter((unit) => unit.parentTempId === null), preset.key).toHaveLength(1);
      expect(Object.keys(preset.labels).sort()).toEqual([
        'campaign',
        'respondent',
        'reviewee',
        'subject',
        'unit',
      ]);
    }
  });

  it('every question carries a config matching its own kind', () => {
    for (const preset of PRESET_LIST) {
      for (const template of preset.templates) {
        for (const question of template.questions) {
          expect(question.config.kind, `${preset.key} / ${question.text}`).toBe(question.kind);
        }
      }
    }
  });
});

describe('INV-002 — nothing is education-specific outside the university preset', () => {
  it('confines Course, Faculty, Student and Semester to seed data', () => {
    const offenders: string[] = [];
    // Education words are banned as IDENTIFIERS - a type, a table, an enum, a route - not as English:
    // a check that flags its own explanation is a check people learn to ignore.
    // The identifier half is enforced by lint; this adds the half a syntax rule cannot see - the words
    // appearing in strings, keys and paths outside the two folders allowed to hold them as DATA.
    // The shared package is scanned too, because it is imported by both apps and has the widest reach.
    const banned = /\b(course|faculty|student|semester)s?\b/i;
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const walk = (dir: string, root: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Build output is generated FROM the sources being checked, so scanning it reports everything twice.
          if (/^(node_modules|dist|dist-config|dist-types)$/.test(entry.name)) continue;
          walk(full, root);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;

        const relative = path.relative(root, full).replace(/\\/g, '/');
        if (relative.startsWith('presets/')) continue;
        if (relative.startsWith('database/seed/')) continue;
        // This file has to name them in order to look for them.
        if (relative.startsWith('test/')) continue;
        // The fourth place the words legitimately live as data: the landing page advertises the presets
        // to somebody with no organisation yet, so the usual label hook cannot serve it.
        if (relative === 'vocabularies.ts') continue;

        const source = stripComments(readFileSync(full, 'utf8'));
        for (const [index, line] of source.split('\n').entries()) {
          if (banned.test(line)) offenders.push(`${relative}:${index + 1}  ${line.trim()}`);
        }
      }
    };
    walk(backendRoot, backendRoot);
    walk(sharedRoot, sharedRoot);

    // The generic model is the whole product claim: a Course type or a student_id column anywhere would
    // make "nothing is education-specific" a slogan rather than a fact.
    expect(offenders).toEqual([]);
  });
});

describe('demo organisations — 50 §3', () => {
  it('ships the four the demo script names', () => {
    expect(DEMO_ORGS.map((org) => org.name)).toEqual([
      'Northfield University',
      'The Grand Palace',
      'Riverside Hospital',
      'Meridian Consulting',
    ]);
  });

  it('is internally consistent: every unit, subject and template resolves', () => {
    for (const org of DEMO_ORGS) {
      const tempIds = new Set(org.units.map((unit) => unit.tempId));
      expect(org.units.filter((unit) => unit.parentTempId === null), org.name).toHaveLength(1);

      for (const unit of org.units) {
        if (unit.parentTempId === null) continue;
        expect(tempIds.has(unit.parentTempId), `${org.name} / ${unit.name}`).toBe(true);
      }
      for (const subject of org.subjects) {
        expect(tempIds.has(subject.unit), `${org.name} / ${subject.name}`).toBe(true);
      }

      const templates = new Set(presetFor(org.industry).templates.map((t) => t.name));
      for (const campaign of org.campaigns) {
        // A campaign naming a template its preset does not have would silently seed no campaign at all,
        // and the organisation would look fine until somebody opened it.
        expect(templates.has(campaign.template), `${org.name} / ${campaign.name}`).toBe(true);
      }
    }
  });

  it('has a written comment pool for every industry it seeds', () => {
    for (const org of DEMO_ORGS) {
      const pool = COMMENT_POOLS[org.industry];
      expect(pool, org.industry).toBeDefined();
      // Generated text in a comment list destroys the illusion instantly, and so does the same sentence
      // repeating down a column.
      expect(pool?.positive.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(pool?.negative.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the seed is deterministic — 50 §8', () => {
  it('produces the same sequence from the same seed', () => {
    const first = Array.from({ length: 20 }, () => new Rng(1001).next());
    const second = Array.from({ length: 20 }, () => new Rng(1001).next());
    expect(first).toEqual(second);

    const a = new Rng(7);
    const b = new Rng(7);
    expect(Array.from({ length: 50 }, () => a.int(1, 100))).toEqual(
      Array.from({ length: 50 }, () => b.int(1, 100)),
    );
  });

  it('skews ratings positive, with a long negative tail', () => {
    const rng = new Rng(42);
    const good = Array.from({ length: 4000 }, () => skewedRating(rng, 5, 0.85));
    const mean = good.reduce((sum, value) => sum + value, 0) / good.length;

    // A well-liked subject averages around four, not around the midpoint: a flat spread is the clearest
    // sign a results screen is fake.
    expect(mean).toBeGreaterThan(3.6);
    expect(mean).toBeLessThan(4.6);
    // The tail is real: some people do give a 1.
    expect(good.filter((value) => value === 1).length).toBeGreaterThan(0);

    const poorRng = new Rng(42);
    const poor = Array.from({ length: 4000 }, () => skewedRating(poorRng, 5, 0.32));
    const poorMean = poor.reduce((sum, value) => sum + value, 0) / poor.length;
    // And the deliberately weak subject is unmistakably worse, or the results screen has nothing to show.
    expect(poorMean).toBeLessThan(mean - 1);
  });
});

describe('the seeded estate has actually PAID for the tiers it sits on', () => {
  // THE BUG THIS PINS. Every runtime path that moves an organisation onto a paid tier writes a
  // payment beside it — join, plan change, Enterprise approval. The seeds wrote the
  // `Subscription` row and nothing else, so a freshly seeded estate had two Enterprise
  // customers, two more on paid tiers, and ONE payment row in the whole ledger. The earnings
  // page read "₹500 lifetime" and was correct to; the data underneath it was the lie.

  it('gives every tier a history that sums to exactly that tier’s list price', () => {
    // The property worth pinning, because it is the one somebody can check by hand: an
    // organisation on Gold has paid Gold's ₹999, whatever route it took to get there. It falls
    // out of `changeCostMinor` rather than out of arithmetic in the seed, which is why a price
    // change in the catalogue cannot silently make the demo estate's books wrong.
    for (const tier of TIERS) {
      const total = historyFor(tier).reduce(
        (sum, step) => sum + changeCostMinor(step.fromTier, step.tier),
        0,
      );
      expect(total, `an org on ${tier} should have paid ${priceOf(tier)}`).toBe(priceOf(tier));
    }
  });

  it('never sells Enterprise through a signup, because no route does', () => {
    // DEC-048 / DEC-100: Enterprise is operator-assigned. A `signup` row landing straight on it
    // would describe a purchase the public join flow cannot make, and the estate page would be
    // telling the owner about revenue that could not have happened.
    for (const tier of TIERS) {
      for (const step of historyFor(tier)) {
        if (step.kind === 'signup') expect(step.tier).toBe('bronze');
      }
    }
  });

  it('charges a paying org more than once and a bronze org exactly once', () => {
    // Bronze IS the join tier, so its whole history is the signup — a second row would be a
    // zero-rupee change, which is the "₹0 row somebody will ask about" that `tiers.ts` warns of.
    expect(historyFor('bronze')).toHaveLength(1);
    for (const tier of TIERS.filter((candidate) => candidate !== 'bronze')) {
      expect(historyFor(tier).length, `${tier} should have a signup AND an upgrade`).toBe(2);
    }
  });
});
