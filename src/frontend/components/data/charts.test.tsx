// T-040 — <BarRow> and <StackedBar>. 24 §3, 21 §8, design_specs/design/08 §8.1.
//
// One rule runs through both files and it is an accessibility invariant, not a preference:
// NEVER COLOUR ALONE. A bar whose only content is a colour is unreadable in greyscale, on a
// projector, and to about one man in twelve.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarRow } from './BarRow.js';
import { StackedBar } from './StackedBar.js';

describe('<BarRow>', () => {
  it('always renders the number beside the bar', () => {
    render(<BarRow label="5" value={241} total={612} />);
    expect(screen.getByText('241')).toBeTruthy();
  });

  it('adds the percent column only when asked', () => {
    const { rerender, container } = render(<BarRow label="5" value={241} total={612} />);
    expect(container.querySelector('.bar-percent')).toBeNull();

    rerender(<BarRow label="5" value={241} total={612} showPercent />);
    expect(screen.getByText('39%')).toBeTruthy();
  });

  it('derives the percent from the same numbers as the bar width', () => {
    // Taken as a prop, the width and the label could disagree — and a bar that disagrees
    // with its own number is worse than no bar. `ResultsView` carries a server-computed
    // `percent` that this deliberately ignores.
    const { container } = render(<BarRow label="4" value={198} total={612} showPercent />);
    const fill = container.querySelector<HTMLElement>('.bar-fill');
    expect(fill?.style.width).toBe('32%');
    expect(screen.getByText('32%')).toBeTruthy();
  });

  it('is single-colour by default', () => {
    // 40 forbids colouring rating 1 red and rating 5 green: that is interpretation, and
    // interpretation is the Analyze layer. The default has to be the neutral one.
    const { container } = render(<BarRow label="1" value={26} total={612} />);
    expect(container.querySelector('.fill-accent')).toBeTruthy();
  });

  it('survives a total of zero without dividing by it', () => {
    const { container } = render(<BarRow label="1" value={0} total={0} showPercent />);
    expect(container.querySelector<HTMLElement>('.bar-fill')?.style.width).toBe('0%');
    expect(screen.getByText('0%')).toBeTruthy();
  });
});

describe('<StackedBar> — the one three-colour chart in the product', () => {
  it('names every band and gives its count, not just its colour', () => {
    render(<StackedBar good={300} neutral={100} bad={100} />);
    for (const label of ['Promoters', 'Passives', 'Detractors']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('300')).toBeTruthy();
  });

  it('splits the track by share', () => {
    const { container } = render(<StackedBar good={300} neutral={100} bad={100} />);
    const widths = [...container.querySelectorAll<HTMLElement>('.stacked-part')]
      .map((part) => part.style.width);
    expect(widths).toEqual(['60%', '20%', '20%']);
  });

  it('renders nothing wider than zero when there is nothing to show', () => {
    const { container } = render(<StackedBar good={0} neutral={0} bad={0} />);
    const widths = [...container.querySelectorAll<HTMLElement>('.stacked-part')]
      .map((part) => part.style.width);
    expect(widths).toEqual(['0%', '0%', '0%']);
  });

  it('can drop the legend, but does not by default', () => {
    const { rerender } = render(<StackedBar good={1} neutral={1} bad={1} />);
    expect(screen.getByText('Promoters')).toBeTruthy();

    rerender(<StackedBar good={1} neutral={1} bad={1} showLegend={false} />);
    expect(screen.queryByText('Promoters')).toBeNull();
  });
});
