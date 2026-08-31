// T-051 — /app/profile. 47 § Acceptance.
//
// The two assertions that matter most here are both about ABSENCE, which is why they are
// written rather than eyeballed: the email must not be editable, and no path may exist for
// giving yourself a position. Both are properties that fail silently — a page that grew an
// edit button on the email would look fine and would be an account-takeover path.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ProfileView } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import { ApiError } from '../../../lib/api.js';
import Profile from './index.js';

const PROFILE: ProfileView = {
  user: {
    id: 'u1', name: 'Amara Rao', email: 'amara@example.test',
    avatarUrl: null, lastLoginAt: '2026-08-20T09:00:00.000Z',
  },
  positions: [
    {
      edgeId: 'e1', roleId: 'role-x', roleName: 'Dean', roleLevel: 1, unitId: 'un1',
      unitName: 'Engineering', isPrimary: true, validTo: null,
    },
  ],
  powersByPlace: [
    {
      unitId: 'un1', unitName: 'Engineering', roleName: 'Dean',
      capabilities: [
        { capability: 'campaign.launch', scope: 'subtree' },
        { capability: 'person.read', scope: 'subtree' },
      ],
    },
  ],
  involvement: [],
};

const rename = vi.fn();
const changePassword = vi.fn();
const reload = vi.fn();
const refresh = vi.fn();
let state: { data: ProfileView | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/profile.js', () => ({
  useProfile: () => ({ ...state, reload, rename, changePassword }),
}));
vi.mock('../../../lib/auth.js', () => ({ useRefreshSession: () => refresh }));

beforeEach(() => {
  vi.clearAllMocks();
  state = { data: PROFILE, loading: false, error: null };
  rename.mockResolvedValue(undefined);
  changePassword.mockResolvedValue(undefined);
  refresh.mockResolvedValue(undefined);
});

const mount = () => renderWithProviders(<Profile />, { labels: NONSENSE_LABELS, path: '/app/profile' });

describe('/app/profile', () => {
  it('shows who you are, where you sit and what that confers', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'My account' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('amara@example.test');
    // Twice on purpose — once as the position, once as the place the powers apply. The
    // position says where they sit; the heading says what that place confers.
    expect(screen.getAllByText('Engineering')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeTruthy();
    expect(screen.getByText('campaign.launch')).toBeTruthy();
    // The level rides on the chip — 47 § Interactions asks for it by name.
    expect(screen.getByText('L1')).toBeTruthy();
  });

  it('THE EMAIL IS READ-ONLY, and says why — 47 § Acceptance', () => {
    mount();
    const email = screen.getByLabelText<HTMLInputElement>('Email');
    expect(email.readOnly).toBe(true);
    // And the reason is on screen. A read-only field with no explanation reads as broken.
    expect(screen.getByText(/identity change/i)).toBeTruthy();
  });

  it('POSITIONS ARE READ-ONLY — there is no self-granting path at all', () => {
    mount();
    // Not "the button is disabled": there is no button. The self-approval loop 33 warns
    // about is closed structurally here rather than detected later.
    expect(screen.queryByRole('button', { name: /position/i })).toBeNull();
    expect(screen.getByText(/Nobody gives themselves a position/)).toBeTruthy();
  });

  it('renames you, and re-reads the session so the top bar changes without a reload', async () => {
    mount();
    const name = screen.getByLabelText('Name');
    fireEvent.click(name);
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Amara R' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(rename).toHaveBeenCalledWith('Amara R'));
    // 47 § State: one source of truth is why the shell updates too.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('changes the password, sending both halves', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password-x' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password-x', newPassword: 'new-password-x',
      }),
    );
  });

  it('REFUSES TO SUBMIT WITHOUT THE CURRENT PASSWORD — the field is not optional', () => {
    mount();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-x' } });
    // An unattended signed-in browser must not be enough to take somebody's account, and
    // the client half of that is that the form cannot be sent with only the new half.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Change password' }).disabled).toBe(true);
  });

  it('puts a wrong current password UNDER THAT FIELD, not in a toast — 47 § States', async () => {
    changePassword.mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_FAILED', status: 422, requestId: 'r1',
        message: 'That is not your current password.',
        details: { fields: [{ path: 'body.currentPassword', message: 'That is not your current password.' }] },
      }),
    );
    mount();
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That is not your current password.');
    // Under the input it is about — the whole reason the server sends a field path.
    expect(alert.closest('.field')?.contains(screen.getByLabelText('Current password'))).toBe(true);
  });

  it('clears both password inputs on success — a used credential is not left on screen', async () => {
    mount();
    const current = screen.getByLabelText<HTMLInputElement>('Current password');
    const next = screen.getByLabelText<HTMLInputElement>('New password');
    fireEvent.change(current, { target: { value: 'old-password-x' } });
    fireEvent.change(next, { target: { value: 'new-password-x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(current.value).toBe(''));
    expect(next.value).toBe('');
  });

  /**
   * N-079. The other half of the fix, and the one a member of staff sees: `/app/profile` is
   * the ONE page in the console a person with no administrative capability can open, so it
   * is the only place they can be told what is waiting on them.
   */
  it('lists what YOU are being asked for, in the organisation’s own noun', () => {
    state = {
      data: {
        ...PROFILE,
        involvement: [
          {
            id: 'c1', name: 'Tuesday dinner poll', status: 'open', reason: 'audience',
            via: 'Learner', startsAt: null, endsAt: null, anonymous: true,
            url: 'https://example.test/r/abcd1234',
          },
        ],
      },
      loading: false, error: null,
    };
    mount();
    const section = screen.getByRole('heading', { name: 'Plithes you are part of' })
      .closest('.settings-card') as HTMLElement;
    expect(within(section).getByText('Tuesday dinner poll')).toBeTruthy();
    expect(within(section).getByRole('heading', { name: 'You are asked to answer' })).toBeTruthy();
  });

  it('KEEPS THE BLOCK WHEN IT IS EMPTY, unlike /app/people/:id — here the empty is an answer', () => {
    // Nothing is filtered out of your own list, so [] means [] and saying so is worth the
    // space. On somebody else's page [] is ambiguous — it may be the reader's own scope —
    // and there the section goes away instead.
    mount();
    expect(screen.getByText('Nothing is open for you to answer right now.')).toBeTruthy();
  });

  it('OPENS WITH NO POSITIONS AT ALL, and does not read as an error — 47 § States', () => {
    // The real state of somebody just invited, which stopped being rare when T-072 made
    // provisioning an account one click.
    state = {
      data: { ...PROFILE, positions: [], powersByPlace: [] }, loading: false, error: null,
    };
    mount();
    expect(screen.getByText(/don't hold any positions yet/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
