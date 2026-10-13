import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PowersAtPlace } from '@endur/shared';
import { PowersByPlace } from './PowersByPlace.js';

const place = (over: Partial<PowersAtPlace> & { unitId: string; unitName: string }): PowersAtPlace => ({
  roleName: 'Head', capabilities: [], ...over,
});

const ENGINEERING = place({
  unitId: 'u1', unitName: 'Engineering', roleName: 'Dean',
  capabilities: [
    { capability: 'campaign.launch', scope: 'subtree' },
    { capability: 'results.read', scope: 'subtree' },
    { capability: 'person.read', scope: 'subtree' },
  ],
});

const MECHANICAL = place({
  unitId: 'u2', unitName: 'Mechanical', roleName: 'Tutor',
  capabilities: [{ capability: 'results.read', scope: 'own_unit' }],
});

describe('<PowersByPlace>', () => {
  it('PROVES INV-005 — a power on one unit does not appear under the other', () => {
    render(<PowersByPlace places={[ENGINEERING, MECHANICAL]} emptyHint="Anywhere else: nothing." />);

    const engineering = screen.getByRole('heading', { name: 'Engineering' }).closest('section');
    const mechanical = screen.getByRole('heading', { name: 'Mechanical' }).closest('section');

    expect(within(engineering as HTMLElement).getByText('campaign.launch')).toBeTruthy();
    expect(within(mechanical as HTMLElement).queryByText('campaign.launch')).toBeNull();
    expect(within(mechanical as HTMLElement).getByText('results.read')).toBeTruthy();
  });

  it('prints the SCOPE beside every capability — the verb alone is D-027', () => {
    render(<PowersByPlace places={[MECHANICAL]} emptyHint="x" />);
    const power = screen.getByText('results.read').closest('.power');
    expect(within(power as HTMLElement).getByText('own_unit')).toBeTruthy();
  });

  it('groups by the catalogue module, reading `packages/shared` rather than fetching', () => {
    render(<PowersByPlace places={[ENGINEERING]} emptyHint="x" />);
    expect(screen.getByText('Campaigns')).toBeTruthy();
    expect(screen.getByText('People')).toBeTruthy();
  });

  it('closes with the elsewhere sentence, which is a SENTENCE and not a third place', () => {
    render(<PowersByPlace places={[ENGINEERING]} emptyHint="Anywhere else: nothing." />);
    expect(screen.getByText('Anywhere else: nothing.')).toBeTruthy();
    expect(document.querySelectorAll('.powers-place')).toHaveLength(1);
  });

  it('says so when there are no places at all, in the words it was given', () => {
    render(<PowersByPlace places={[]} emptyHint="Nothing anywhere, because they hold no position." />);
    expect(screen.getByText('Nothing anywhere, because they hold no position.')).toBeTruthy();
  });

  it('says "no powers here" for a position that confers nothing', () => {
    render(<PowersByPlace places={[place({ unitId: 'u3', unitName: 'Empty Unit' })]} emptyHint="x" />);
    expect(screen.getByText('No powers here.')).toBeTruthy();
  });

  it('offers no `Why?` link unless one is wired — 42 is not built', () => {
    const { rerender } = render(<PowersByPlace places={[MECHANICAL]} emptyHint="x" />);
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();

    const onWhy = vi.fn();
    rerender(<PowersByPlace places={[MECHANICAL]} emptyHint="x" onWhy={onWhy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));
    expect(onWhy).toHaveBeenCalledWith('results.read', 'u2');
  });
});
