// T-032 — the wizard, end to end in jsdom. 31 § Acceptance.
//
// The acceptance criteria that can be checked without a stopwatch are all here. The two
// that cannot — "under 100 seconds with a stopwatch" and "rehearsed three times" — are
// `T-045`, and no test can stand in for them.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { PresetView } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Setup from './index.js';

const university: PresetView = {
  key: 'university',
  displayName: 'University',
  roles: [{ name: 'Dean' }, { name: 'Head' }, { name: 'Tutor' }, { name: 'Learner' }],
  units: [
    { tempId: 'u1', name: 'Northfield', parentTempId: null },
    { tempId: 'u2', name: 'Engineering', parentTempId: 'u1' },
  ],
  labels: {
    unit: { one: 'Zblorn', many: 'Zblorns' },
    subject: { one: 'Quaxel', many: 'Quaxels' },
    respondent: { one: 'Frimble', many: 'Frimbles' },
    reviewee: { one: 'Vandor', many: 'Vandors' },
    campaign: { one: 'Plithe', many: 'Plithes' },
  },
  templates: [{ name: 'Starter form', category: 'general', questionCount: 5 }],
};

const hotel: PresetView = {
  key: 'hotel',
  displayName: 'Hotel',
  roles: [{ name: 'GM' }, { name: 'Manager' }, { name: 'Guest' }],
  units: [{ tempId: 'h1', name: 'The Grand Palace', parentTempId: null }],
  labels: {
    unit: { one: 'Property', many: 'Properties' },
    subject: { one: 'Restaurant', many: 'Restaurants' },
    respondent: { one: 'Guest', many: 'Guests' },
    reviewee: { one: 'Staff member', many: 'Staff members' },
    campaign: { one: 'Guest survey', many: 'Guest surveys' },
  },
  templates: [],
};

const custom: PresetView = {
  key: 'custom',
  displayName: 'Custom',
  roles: [{ name: 'Owner' }, { name: 'Member' }],
  units: [{ tempId: 'c1', name: 'Organization', parentTempId: null }],
  labels: {
    unit: { one: 'Unit', many: 'Units' },
    subject: { one: 'Subject', many: 'Subjects' },
    respondent: { one: 'Respondent', many: 'Respondents' },
    reviewee: { one: 'Reviewee', many: 'Reviewees' },
    campaign: { one: 'Campaign', many: 'Campaigns' },
  },
  templates: [],
};

const commit = vi.fn();
const refresh = vi.fn();
let presetState = { data: [university, hotel, custom] as PresetView[] | null, loading: false, error: null as Error | null };

vi.mock('../../../lib/org.js', () => ({
  usePresets: () => presetState,
  useSetupOrg: () => commit,
}));
vi.mock('../../../lib/auth.js', () => ({
  useRefreshSession: () => refresh,
  useSignIn: () => vi.fn(),
  useRegister: () => vi.fn(),
}));

const mount = (step = 'industry') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/setup" element={<Setup />} />
      <Route path="/app" element={<p>CONSOLE</p>} />
    </Routes>,
    { path: `/app/setup?step=${step}`, labels: NONSENSE_LABELS, capabilities: ['org.update'] },
  );

const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
const clickButton = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const continueOn = () => clickButton('Continue');

beforeEach(() => {
  commit.mockReset();
  refresh.mockReset();
  commit.mockResolvedValue({ id: 'o1' });
  refresh.mockResolvedValue({});
  presetState = { data: [university, hotel, custom], loading: false, error: null };
});

describe('step 1 — industry', () => {
  it('does not open half-populated: it holds until the presets are in', () => {
    presetState = { data: null, loading: true, error: null };
    mount();
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  // DEC-085 MOVED THIS, and moved it knowingly. `31` § step 1 put the role chain and the
  // vocabulary pair on EVERY card so four different organisations were legible side by
  // side before a single click — the presenter's ten-second beat. The split pane shows one
  // preset at a time and shows strictly MORE of it: all four roles as a chart, plus both
  // terms in a full sentence, none of which fits on a card in a five-card grid.
  //
  // WHAT IS ASSERTED HERE IS THE PROPERTY, NOT THE PLACEMENT: step 1 tells you what a
  // preset would actually do to your organisation, in this organisation's own words,
  // BEFORE you commit to it. That was the point of the original and it still holds. The
  // cost is real and is recorded in DEC-085: you now compare presets serially.
  it('shows the role chain and the vocabulary pair for the preset under consideration', () => {
    mount();
    pick('University');
    for (const role of ['Dean', 'Head', 'Tutor', 'Learner']) {
      expect(screen.getByText(role)).toBeTruthy();
    }
    expect(screen.getByText('Zblorn')).toBeTruthy();
    expect(screen.getByText('Frimble')).toBeTruthy();
  });

  it('says nothing about roles or words until a preset is under consideration', () => {
    // The other half of the same decision: the aside is the ONLY place this now lives, so
    // an empty aside must read as "pick one", never as "this preset has nothing in it".
    mount();
    expect(screen.queryByText('Dean')).toBeNull();
    expect(screen.getByText(/Select an organization type/)).toBeTruthy();
  });

  it('carries the presenter\'s script for an organisation nobody listed', () => {
    mount();
    expect(screen.getByText(/Pick the closest one/)).toBeTruthy();
  });

  it('keeps Continue disabled until something is chosen', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
    pick('University');
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('step 2 — roles', () => {
  const toRoles = () => {
    mount();
    pick('University');
    continueOn();
  };

  it('numbers levels from row order and generates the "Sees…" column', () => {
    toRoles();
    expect(screen.getByLabelText('Level 1')).toBeTruthy();
    expect(screen.getByText('Sees everything')).toBeTruthy();
    expect(screen.getByText('Sees levels 3–4')).toBeTruthy();
    expect(screen.getByText('Sees level 4')).toBeTruthy();
    expect(screen.getByText('Responds only')).toBeTruthy();
  });

  it('renumbers and re-describes live when a row moves', () => {
    toRoles();
    // Move "Head" (level 2) up. It becomes level 1 and its description becomes the top one.
    clickButton('Move Head up');

    const rows = screen.getAllByLabelText<HTMLInputElement>('Role name');
    expect(rows.map((row) => row.value)).toEqual(['Head', 'Dean', 'Tutor', 'Learner']);
    // The text is generated from position, so nothing had to be re-entered.
    expect(screen.getByText('Sees everything')).toBeTruthy();
  });

  it('will not delete the lowest role — somebody has to be at the bottom', () => {
    toRoles();
    const bottom = screen.getByLabelText(/Learner is the lowest level and cannot be deleted/);
    expect(bottom.closest('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('adds a role above the bottom row', () => {
    toRoles();
    clickButton('Add a role');
    const values = screen.getAllByLabelText<HTMLInputElement>('Role name').map((i) => i.value);
    expect(values[values.length - 1]).toBe('Learner');
    expect(values).toHaveLength(5);
  });

  it('blocks Continue while two roles share a name', () => {
    toRoles();
    const inputs = screen.getAllByLabelText('Role name');
    fireEvent.change(inputs[1]!, { target: { value: 'Dean' } });
    fireEvent.blur(inputs[1]!);
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('step 3 — structure', () => {
  const mountStructure = () => {
    const result = mount();
    pick('University');
    continueOn();
    continueOn();
    return result;
  };
  const toStructure = () => mountStructure();

  it('labels the add button from the DRAFT vocabulary, not the saved one (INV-001)', () => {
    toStructure();
    // The store still holds NONSENSE_LABELS; the button must read the wizard's draft.
    expect(screen.getAllByRole('button', { name: 'Add a Zblorn' }).length).toBeGreaterThan(0);
  });

  it('adds a child under the row that was clicked, and focuses its name', () => {
    toStructure();
    const before = screen.getAllByLabelText('Name').length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a Zblorn' })[0]!);
    const after = screen.getAllByLabelText<HTMLInputElement>('Name');
    expect(after).toHaveLength(before + 1);
    // Two clicks and two words: the next keystroke is the name.
    expect(document.activeElement).toBe(after[after.length - 1]);
  });

  it('never offers to delete the root — it is the organisation', () => {
    toStructure();
    expect(screen.queryByLabelText('Delete Northfield')).toBeNull();
    expect(screen.getByLabelText('Delete Engineering')).toBeTruthy();
  });

  it('re-parents by keyboard as well as by drag, because touch has no drag', () => {
    const { container } = mountStructure();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a Zblorn' })[0]!);
    const names = screen.getAllByLabelText<HTMLInputElement>('Name');
    fireEvent.change(names[names.length - 1]!, { target: { value: 'Physics' } });
    fireEvent.blur(names[names.length - 1]!);

    clickButton('Move Physics');
    expect(screen.getByRole('status').textContent).toContain('Physics');

    // Every legal destination offers itself, and its own subtree does not — that is the
    // cycle guard, visible in the UI rather than only in the reducer.
    const destinations = screen.getAllByRole('button', { name: 'Move here' });
    expect(destinations).toHaveLength(2); // Northfield and Engineering, not Physics
    // Every destination must be VISIBLE without hovering it, or the keyboard and touch
    // path is decorative. `.unit-actions` is opacity:0 until hover, and a child cannot
    // out-opacity a zero parent — so the tree carries the override, not the button.
    expect(container.querySelector('.unit-tree')?.className).toContain('is-relocating');
    fireEvent.click(destinations[1]!);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move here' })).toBeNull();
  });
});

describe('step 4 — words, and the preview that proves the claim', () => {
  const mountWords = () => {
    const result = mount();
    pick('University');
    continueOn();
    continueOn();
    continueOn();
    return result;
  };
  const toWords = () => mountWords();

  it('renders the preview from the draft and updates it on every keystroke', () => {
    const { container } = mountWords();
    const preview = () => container.querySelector('.preview')?.textContent ?? '';
    expect(preview()).toContain('Quaxels');

    fireEvent.change(screen.getByLabelText('The thing being reviewed'), {
      target: { value: 'Studio' },
    });

    // No save, no request — the point of the step is that it is instant.
    expect(preview()).toContain('Studios');
    expect(preview()).not.toContain('Quaxels');
    expect(commit).not.toHaveBeenCalled();
  });

  it('derives the plural, and stops the moment one is typed', () => {
    toWords();
    fireEvent.change(screen.getByLabelText('The people being reviewed'), {
      target: { value: 'Staff' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Plural of Staff').value).toBe('Staffs');

    fireEvent.change(screen.getByLabelText('Plural of Staff'), { target: { value: 'Staff' } });
    fireEvent.change(screen.getByLabelText('The people being reviewed'), {
      target: { value: 'Staff' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Plural of Staff').value).toBe('Staff');
  });
});

describe('the whole wizard', () => {
  const toReview = () => {
    mount();
    pick('University');
    continueOn();
    continueOn();
    continueOn();
    continueOn();
  };

  it('never loses a rename made three steps earlier', () => {
    mount();
    pick('University');
    continueOn();

    const roleInputs = screen.getAllByLabelText('Role name');
    fireEvent.change(roleInputs[0]!, { target: { value: 'Provost' } });
    fireEvent.blur(roleInputs[0]!);

    continueOn();
    continueOn();
    continueOn();
    // Step 5 shows it, and going back shows it still in the field.
    expect(screen.getByText(/Provost → Head → Tutor → Learner/)).toBeTruthy();

    clickButton('Back');
    clickButton('Back');
    clickButton('Back');
    expect(screen.getAllByLabelText<HTMLInputElement>('Role name')[0]?.value).toBe('Provost');
  });

  it('summarises with numbers, not reassurance', () => {
    toReview();
    expect(screen.getByText('4 levels')).toBeTruthy();
    expect(screen.getByText('2 units, 2 deep')).toBeTruthy();
    expect(screen.getByText('Zblorn · Quaxel · Frimble · Vandor')).toBeTruthy();
  });

  it('jumps back to a step from its pencil', () => {
    toReview();
    clickButton('Edit roles');
    expect(screen.getByText('Sees everything')).toBeTruthy();
  });

  it('commits ONCE, with the level derived from order and every draft word', async () => {
    toReview();
    clickButton('Finish setup');

    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0]).toEqual({
      industry: 'university',
      roles: [{ name: 'Dean' }, { name: 'Head' }, { name: 'Tutor' }, { name: 'Learner' }],
      units: [
        { tempId: 'u1', name: 'Northfield', parentTempId: null },
        { tempId: 'u2', name: 'Engineering', parentTempId: 'u1' },
      ],
      labels: university.labels,
      includeTemplates: true,
    });
    // The vocabulary changed under every console screen; the session must be re-read
    // before navigating or /app renders the words the wizard just replaced.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps every field when the commit fails', async () => {
    commit.mockRejectedValue(new Error('nope'));
    toReview();
    clickButton('Finish setup');

    expect((await screen.findByRole('alert')).textContent).toContain('Could not save');
    // Still on review, still holding everything.
    expect(screen.getByText('4 levels')).toBeTruthy();
    expect(screen.queryByText('CONSOLE')).toBeNull();
  });

  it('asks before throwing away edits to switch industry', () => {
    mount();
    pick('University');
    continueOn();
    const inputs = screen.getAllByLabelText('Role name');
    fireEvent.change(inputs[0]!, { target: { value: 'Provost' } });
    fireEvent.blur(inputs[0]!);
    clickButton('Back');

    pick('Hotel');
    const dialog = screen.getByRole('alertdialog');
    // Real numbers, never "Are you sure?" (24 §6).
    expect(within(dialog).getByText(/4 roles, 2 units/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    // Cancelling keeps the edited draft, and the industry it belongs to.
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /University/ }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Hotel/ }).checked).toBe(false);
    continueOn();
    expect(screen.getAllByLabelText<HTMLInputElement>('Role name')[0]?.value).toBe('Provost');
  });

  it('does not advance the step BEHIND the confirm dialog when Enter is pressed', () => {
    // Found by reading, 19 Aug: the wizard's global Enter handler kept working while the
    // modal was up, so the dialog stayed open over a screen that was no longer the one it
    // was asking about. A modal owns the keyboard.
    mount();
    pick('University');
    continueOn();
    const inputs = screen.getAllByLabelText('Role name');
    fireEvent.change(inputs[0]!, { target: { value: 'Provost' } });
    fireEvent.blur(inputs[0]!);
    clickButton('Back');
    pick('Hotel');

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.queryByText('Sees everything')).toBeNull();
  });

  /**
   * ENTER INSIDE A TEXT FIELD BELONGS TO THE FIELD — `DEC-105`, and this is the owner's
   * report: *"clicking enter goes to next page when I am just trying to form the team."*
   *
   * The handler exempted `BUTTON` and `TEXTAREA` and nothing else, so `INPUT` fell through to
   * "advance the step" — on the two steps built entirely around typing into inputs. Step 3's
   * `+` ADDS A CHILD UNIT AND FOCUSES ITS NAME INPUT, so the wizard handed the user a text
   * field and then read the natural key for finishing a row as the key for leaving the screen.
   *
   * The event is dispatched FROM THE INPUT, not from `document.body`, because the whole bug
   * was about which element the key came from — a `body`-sourced event would pass against the
   * broken handler too.
   */
  it('does not advance the step when Enter is pressed inside a text field', () => {
    mount();
    pick('University');
    continueOn();
    const input = screen.getAllByLabelText('Role name')[0] as HTMLElement;
    expect(screen.getByText('Sees everything')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });

    // Still on the roles step. `Sees everything` is step 2's copy and it is gone on step 3.
    expect(screen.getByText('Sees everything')).toBeTruthy();
  });

  /**
   * AND ENTER STILL ADVANCES WHERE THERE IS NOTHING TO TYPE — `DEC-105`'s `not` clause. The
   * fix that would have been easiest is deleting the handler; step 1 is a radio grid, and the
   * key that means "yes, that one" is the one this test presses.
   */
  it('still advances on Enter from outside a text field', () => {
    mount();
    pick('University');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.getByText('Sees everything')).toBeTruthy();
  });

  it('switches silently when there is nothing to lose', () => {
    mount();
    pick('University');
    pick('Hotel');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    continueOn();
    expect(screen.getAllByLabelText<HTMLInputElement>('Role name')[0]?.value).toBe('GM');
  });

  it('SKIP SETUP commits the Custom preset — it is the emergency exit and it must work', async () => {
    mount();
    clickButton('Skip setup →');

    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[0]).toMatchObject({
      industry: 'custom',
      roles: [{ name: 'Owner' }, { name: 'Member' }],
    });
    // A navigation would have left an org with no roles — the exact empty console the
    // wizard exists to prevent. It is a real commit.
    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
  });
});
