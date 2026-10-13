import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';
import { isUnscannable, ShareSheet } from './ShareSheet.js';

const toCanvas = vi.fn();
const toDataURL = vi.fn();
let writeText = vi.fn();

vi.mock('qrcode', () => ({
  default: {
    toCanvas: (...args: unknown[]) => toCanvas(...args) as unknown,
    toDataURL: (...args: unknown[]) => toDataURL(...args) as unknown,
  },
}));

const URL_OK = 'https://feedback.example.test/r/K4M9X2PQ';

const mount = (over: Partial<Parameters<typeof ShareSheet>[0]> = {}) => {
  const onClose = vi.fn();
  const result = renderWithProviders(
    <ShareSheet
      url={URL_OK}
      campaignName="Spring check"
      status="open"
      endsAt="2026-08-26T23:59:00.000Z"
      anonymous
      onClose={onClose}
      {...over}
    />,
    { labels: NONSENSE_LABELS },
  );
  return { onClose, ...result };
};

const canvasOptions = (): Record<string, unknown> =>
  toCanvas.mock.calls[0]?.[2] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  toCanvas.mockResolvedValue(undefined);
  toDataURL.mockResolvedValue('data:image/png;base64,AAAA');
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('the scanning requirements, none of which are visible in a screenshot', () => {
  it('encodes at error-correction level M', () => {
    mount();
    expect(canvasOptions()).toMatchObject({ errorCorrectionLevel: 'M' });
  });

  it('leaves a quiet zone — the single most common cause of scan failure', () => {
    mount();
    expect(canvasOptions()['margin']).toBeGreaterThanOrEqual(4);
  });

  it('is at least 280px', () => {
    mount();
    expect(canvasOptions()['width']).toBeGreaterThanOrEqual(280);
  });

  it('is pure ink on pure white, untinted', () => {
    mount();
    // eslint-disable-next-line no-restricted-syntax -- pinning the values on purpose (N-037)
    expect(canvasOptions()['color']).toEqual({ dark: '#17232e', light: '#ffffff' });
  });

  it('encodes the URL it was given, unchanged', () => {
    mount();
    expect(toCanvas.mock.calls[0]?.[1]).toBe(URL_OK);
  });

  it('renders the code locally, never through an image service', () => {
    const { container } = mount();
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('names the code for anyone who cannot see it', () => {
    mount();
    expect(screen.getByRole('img', { name: /QR code for feedback.example.test/ })).toBeTruthy();
  });
});

describe('the URL is for the person who will not scan it', () => {
  it('shows it without the scheme, and selectable', () => {
    const { container } = mount();
    const line = container.querySelector('.share-url');
    expect(line?.textContent).toBe('feedback.example.test/r/K4M9X2PQ');
  });

  it('copies in place, with no toast — the dialog is already the focus', async () => {
    mount();
    const button = screen.getByRole('button', { name: 'Copy link' });
    await act(async () => { fireEvent.click(button); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith(URL_OK);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so when the browser refuses to copy, rather than pretending it worked', async () => {
    writeText = vi.fn().mockRejectedValue(new Error('no'));
    Object.assign(navigator, { clipboard: { writeText } });
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/selected by hand/);
  });
});

describe('the localhost trap, made impossible to miss', () => {
  it('recognises every form of it', () => {
    expect(isUnscannable('http://localhost:5173/r/ABC')).toBe(true);
    expect(isUnscannable('http://127.0.0.1:5173/r/ABC')).toBe(true);
    expect(isUnscannable('http://0.0.0.0:5173/r/ABC')).toBe(true);
    expect(isUnscannable('https://feedback.example.test/r/ABC')).toBe(false);
    expect(isUnscannable('http://192.168.1.14:5173/r/ABC')).toBe(false);
  });

  it('warns in place when the URL cannot be scanned', () => {
    mount({ url: 'http://localhost:5173/r/K4M9X2PQ' });
    expect(screen.getByRole('alert').textContent).toMatch(/points at localhost/);
    expect(screen.getByRole('alert').textContent).toMatch(/PUBLIC_BASE_URL/);
  });

  it('says nothing when the URL is fine', () => {
    mount();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('presentation mode is what goes on the projector', () => {
  it('fills the screen and drops everything else', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Full' }));
    expect(container.querySelector('.present')).toBeTruthy();
    expect(container.querySelector('.share-foot-actions')).toBeNull();
  });

  it('draws the code larger than the sheet does', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Full' }));
    const sizes = toCanvas.mock.calls.map((call) => (call[2] as { width: number }).width);
    expect(Math.max(...sizes)).toBeGreaterThan(sizes[0] as number);
  });

  it('Escape leaves presentation first and the sheet second, never both at once', () => {
    const { onClose, container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Full' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.present')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the sheet reports the campaign honestly', () => {
  it('says collecting while it is open, with the window and the anonymity', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Spring check' })).toBeTruthy();
    expect(screen.getByText('Collecting')).toBeTruthy();
    expect(screen.getByText(/Open until .* · anonymous/)).toBeTruthy();
  });

  it('does not claim to be collecting once closed', () => {
    mount({ status: 'closed' });
    expect(screen.getByRole('heading', { name: 'Spring check' })).toBeTruthy();
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.queryByText('Collecting')).toBeNull();
  });

  it('drops the anonymity claim when the campaign is not anonymous', () => {
    mount({ anonymous: false });
    expect(screen.queryByText(/anonymous/)).toBeNull();
  });

  it('offers the code as a file at print resolution', async () => {
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download QR' }));
      await Promise.resolve();
    });
    expect((toDataURL.mock.calls[0]?.[1] as { width: number }).width).toBeGreaterThanOrEqual(1024);
  });

  it('names the ORG\'S respondents, not "Respondents" — 22 §5, T-044', () => {
    const { container } = mount();
    expect(screen.getByText(/Frimbles don’t need an account/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Respondent/);
  });
});

describe('a restricted link warns the person handing it out — DEC-037, 24 §6', () => {
  it('replaces the line that would otherwise be FALSE', () => {
    mount({ access: 'organization' });

    expect(screen.queryByText(/don’t need an account/)).toBeNull();
    expect(screen.getByText(/Only people in Northfield can answer/)).toBeTruthy();
    expect(screen.getByText(/asked to sign in/)).toBeTruthy();
  });

  it('leaves an open link saying exactly what it said before', () => {
    mount();
    expect(screen.getByText(/Frimbles don’t need an account/)).toBeTruthy();
    expect(screen.queryByText(/asked to sign in/)).toBeNull();
  });

  it('defaults to open when nothing is passed — every existing caller is unchanged', () => {
    mount({ access: undefined });
    expect(screen.getByText(/Frimbles don’t need an account/)).toBeTruthy();
  });

  it('changes ONE line and nothing else about the sheet', () => {
    mount({ access: 'organization' });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Full' })).toBeTruthy();
    expect(screen.getByText(URL_OK.replace(/^https:\/\//, ''))).toBeTruthy();
  });
});
