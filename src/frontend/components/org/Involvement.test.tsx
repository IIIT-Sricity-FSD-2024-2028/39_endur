import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { PersonCampaign } from '@endur/shared';
import { renderWithProviders } from '../../test-utils.js';
import { Involvement } from './Involvement.js';

const row = (over: Partial<PersonCampaign> & { id: string; name: string }): PersonCampaign => ({
  status: 'open', reason: 'everyone', via: null,
  startsAt: null, endsAt: null, anonymous: true, url: 'https://example.test/r/abcd1234',
  ...over,
});

const ASKED = row({
  id: 'c1', name: 'Tuesday dinner poll', reason: 'audience', via: 'Learner',
});
const ABOUT = row({
  id: 'c2', name: 'Mid-semester review', reason: 'subject', via: 'Data Structures',
});
const ANYONE = row({ id: 'c3', name: 'Suggestion box' });

const groupOf = (heading: string): HTMLElement =>
  screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe('<Involvement>', () => {
  it('keeps the three reasons three groups — they are different relationships', () => {
    renderWithProviders(<Involvement items={[ASKED, ABOUT, ANYONE]} who="them" emptyHint="—" />);

    const about = groupOf('About them');
    const asked = groupOf('They are asked to answer');
    const anyone = groupOf('Open to everyone');

    expect(within(about).getByText('Mid-semester review')).toBeTruthy();
    expect(within(asked).queryByText('Mid-semester review')).toBeNull();
    expect(within(asked).getByText('Tuesday dinner poll')).toBeTruthy();
    expect(within(anyone).getByText('Suggestion box')).toBeTruthy();
  });

  it('says "you" on your own page and "them" on somebody else’s', () => {
    const { unmount } = renderWithProviders(<Involvement items={[ASKED]} who="you" emptyHint="—" />);
    expect(screen.getByRole('heading', { name: 'You are asked to answer' })).toBeTruthy();
    unmount();

    renderWithProviders(<Involvement items={[ASKED]} who="them" emptyHint="—" />);
    expect(screen.getByRole('heading', { name: 'They are asked to answer' })).toBeTruthy();
  });

  it('prints the position that put them there, and nothing where there is none', () => {
    renderWithProviders(<Involvement items={[ASKED, ANYONE]} who="them" emptyHint="—" />);
    expect(within(groupOf('They are asked to answer')).getByText('Learner')).toBeTruthy();
    expect(within(groupOf('Open to everyone')).queryByText('Learner')).toBeNull();
  });

  it('links the name only for a reader who may open the campaign', () => {
    const { unmount } = renderWithProviders(
      <Involvement items={[ASKED]} who="them" emptyHint="—" canOpenCampaign />,
    );
    expect(screen.getByRole('link', { name: 'Tuesday dinner poll' })).toBeTruthy();
    unmount();

    renderWithProviders(<Involvement items={[ASKED]} who="them" emptyHint="—" />);
    expect(screen.getByText('Tuesday dinner poll')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Tuesday dinner poll' })).toBeNull();
  });

  it('offers the respondent link, which is the whole point of the block', () => {
    renderWithProviders(<Involvement items={[ASKED]} who="you" emptyHint="—" />);
    const open = screen.getByRole('link', { name: /Open/ });
    expect(open.getAttribute('href')).toBe('https://example.test/r/abcd1234');
  });

  it('says the empty hint rather than rendering an empty area', () => {
    renderWithProviders(<Involvement items={[]} who="you" emptyHint="Nothing is open for you." />);
    expect(screen.getByText('Nothing is open for you.')).toBeTruthy();
  });
});
