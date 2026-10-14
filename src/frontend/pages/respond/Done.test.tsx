import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ResolvedLabels } from '@endur/shared';
import type { DoneState } from '../../lib/respond.js';
import Done from './Done.js';

const LABELS: ResolvedLabels = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

const STATE: DoneState = {
  responseCount: 612, subjectName: 'Data Structures', anonymous: true, labels: LABELS,
};

const mount = (state: DoneState | null) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/r/K4M9X2PQ/done', state }]}>
      <Routes>
        <Route path="/r/:token/done" element={<Done />} />
      </Routes>
    </MemoryRouter>,
  );

describe('the applause', () => {
  it('thanks them and names what it was about', () => {
    mount(STATE);
    expect(screen.getByRole('heading', { name: 'Thank you.' })).toBeTruthy();
    expect(screen.getByText('Your feedback on Data Structures has been recorded anonymously.'))
      .toBeTruthy();
  });

  it('shows the count in the org\'s own noun — the detail that lands', () => {
    mount(STATE);
    expect(screen.getByText('612 Frimbles have responded to this Plithe.')).toBeTruthy();
  });

  it('never prompts for an account, and offers no way back into the form', () => {
    mount(STATE);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/sign in|account|another response/i)).toBeNull();
  });

  it('still thanks somebody who opened the URL directly', () => {
    mount(null);
    expect(screen.getByRole('heading', { name: 'Thank you.' })).toBeTruthy();
    expect(screen.queryByText(/have responded/)).toBeNull();
  });
});
