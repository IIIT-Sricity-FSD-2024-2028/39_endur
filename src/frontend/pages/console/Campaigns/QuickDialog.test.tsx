// The poll and suggestion-box dialog. It creates AND launches in one press, so a closing time
// that has already passed would make a live QR code that turns everybody away: it is refused
// here, before the button, and again by the server.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { QuickCampaignBody } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../../test-utils.js';
import { toLocalInput } from '../../../lib/when.js';
import { QuickDialog } from './QuickDialog.js';

const quickCreate = vi.fn();
vi.mock('../../../lib/campaigns.js', () => ({
  quickCreate: (body: QuickCampaignBody) => quickCreate(body) as unknown,
}));

const HOUR = 60 * 60 * 1000;
const onCreated = vi.fn();

const mount = () =>
  renderWithProviders(
    <QuickDialog purpose="poll" onCreated={onCreated} onCancel={vi.fn()} />,
    { labels: NONSENSE_LABELS },
  );

const fillPoll = (): void => {
  fireEvent.change(screen.getByLabelText('What are you asking?'), { target: { value: 'Hi' } });
  fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: '2' } });
};

const createButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Create and share' });

beforeEach(() => {
  vi.clearAllMocks();
  quickCreate.mockResolvedValue({ id: 'c1' });
});

describe('closing it automatically', () => {
  it('will not create a poll whose closing time has already passed', () => {
    mount();
    fillPoll();
    expect(createButton().disabled).toBe(false);

    const ends = screen.getByLabelText<HTMLInputElement>('Close it automatically (optional)');
    fireEvent.change(ends, { target: { value: toLocalInput(Date.now() - 3 * 24 * HOUR) } });

    expect(screen.getByRole('alert').textContent).toMatch(/already passed/);
    expect(ends.getAttribute('aria-invalid')).toBe('true');
    expect(createButton().disabled).toBe(true);
    fireEvent.submit(createButton().closest('form') as HTMLFormElement);
    expect(quickCreate).not.toHaveBeenCalled();
  });

  it('offers only the future in the picker', () => {
    mount();
    const ends = screen.getByLabelText<HTMLInputElement>('Close it automatically (optional)');
    // Minute precision: what the input shows, in the browser's own time zone.
    expect(Date.parse(ends.min)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(ends.min)).toBeGreaterThan(Date.now() - 2 * 60 * 1000);
  });

  it('creates with a closing time in the future, or with none', async () => {
    mount();
    fillPoll();
    fireEvent.change(screen.getByLabelText('Close it automatically (optional)'), {
      target: { value: toLocalInput(Date.now() + 2 * HOUR) },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(createButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const body = quickCreate.mock.calls[0]?.[0] as QuickCampaignBody;
    expect(body.endsAt?.getTime()).toBeGreaterThan(Date.now());
    expect(body.options).toEqual(['1', '2']);
  });

  it('a time that passes while the dialog is open is caught on submit', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      mount();
      fillPoll();
      fireEvent.change(screen.getByLabelText('Close it automatically (optional)'), {
        target: { value: toLocalInput(Date.now() + 5 * 60 * 1000) },
      });
      expect(createButton().disabled).toBe(false);

      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      fireEvent.click(createButton());

      expect(quickCreate).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toMatch(/already passed/);
    } finally {
      vi.useRealTimers();
    }
  });
});
