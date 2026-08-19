// T-038 — <ShareSheet>. 24 §6, 06 §6.3, 38 § The share sheet.
//
// The highest-risk component in the build, so these tests assert the SCANNING requirements
// rather than the layout: error correction level, quiet zone, pure colours, minimum size.
// None of those are visible in a screenshot and all of them decide whether the demo works.
//
// jsdom has no canvas, so `qrcode` is mocked at the module boundary and the OPTIONS it is
// handed are what gets checked. That is the right seam anyway — the encoder is a tested
// library, and what this component owns is the parameters.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { isUnscannable, ShareSheet } from './ShareSheet.js';

const toCanvas = vi.fn();
const toDataURL = vi.fn();
/** Held by reference: reading it back off `navigator` hands lint an unbound method. */
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
  const result = render(
    <ShareSheet
      url={URL_OK}
      campaignName="Spring check"
      status="open"
      endsAt="2026-08-26T23:59:00.000Z"
      anonymous
      onClose={onClose}
      {...over}
    />,
  );
  return { onClose, ...result };
};

/** The options the component handed the encoder for the on-screen code. */
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
    // Not a token: a QR is decoded by thresholding luminance, and re-theming the product
    // must not change the contrast a phone camera has to work with.
    //
    // The literals are the ASSERTION — pinning them is the whole point, so that anybody who
    // later "helpfully" routes these through a token breaks this test rather than the demo.
    // eslint-disable-next-line no-restricted-syntax -- pinning the values on purpose (N-037)
    expect(canvasOptions()['color']).toEqual({ dark: '#17232e', light: '#ffffff' });
  });

  it('encodes the URL it was given, unchanged', () => {
    mount();
    expect(toCanvas.mock.calls[0]?.[1]).toBe(URL_OK);
  });

  it('renders the code locally, never through an image service', () => {
    const { container } = mount();
    // An external service fails exactly when the network does, which on demo day is the
    // moment it matters.
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
    // Somebody at the back types this instead of scanning, which is why the token is eight
    // unambiguous characters and not a UUID (DEC-017).
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
    // PUBLIC_BASE_URL ships defaulted to localhost, and a QR encoding it resolves to the
    // PHONE. It fails silently and looks like a broken product (OPEN-002).
    expect(isUnscannable('http://localhost:5173/r/ABC')).toBe(true);
    expect(isUnscannable('http://127.0.0.1:5173/r/ABC')).toBe(true);
    expect(isUnscannable('http://0.0.0.0:5173/r/ABC')).toBe(true);
    expect(isUnscannable('https://feedback.example.test/r/ABC')).toBe(false);
    // A LAN address is a legitimate answer to OPEN-002 — a phone on the same wifi reaches it.
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
    expect(container.querySelector('.share-actions')).toBeNull();
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
    // One key, two levels: the reader is never dumped two screens back.
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the sheet reports the campaign honestly', () => {
  it('says collecting while it is open, with the window and the anonymity', () => {
    mount();
    expect(screen.getByText(/Spring check is collecting/)).toBeTruthy();
    expect(screen.getByText(/Open until .* · anonymous/)).toBeTruthy();
  });

  it('does not claim to be collecting once closed', () => {
    // A sheet saying "is collecting" over a closed campaign is worse than no sheet: it is
    // reachable forever from the card, so it will be opened after the fact.
    mount({ status: 'closed' });
    expect(screen.getByText(/Spring check has closed/)).toBeTruthy();
    expect(screen.queryByText(/is collecting/)).toBeNull();
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
    // A poster on a wall is the other half of the collection model.
    expect((toDataURL.mock.calls[0]?.[1] as { width: number }).width).toBeGreaterThanOrEqual(1024);
  });
});
