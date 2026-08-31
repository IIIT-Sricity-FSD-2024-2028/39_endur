// <FileUpload> — 24 §5, 48. T-062.
//
// The client checks are a courtesy, not a control (the server refuses the same things and
// is tested separately in backend/test/upload.test.ts). What these tests are actually about
// is that the courtesy behaves: the right message, inline, and no request fired.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileUpload } from './FileUpload.js';

// jsdom has no object URLs. The component uses one for the instant local preview, which is
// a real behaviour worth keeping, so it is stubbed rather than removed.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const png = (bytes: number, type = 'image/png') =>
  new File([new Uint8Array(bytes)], 'logo.png', { type });

function setup(overrides: Partial<Parameters<typeof FileUpload>[0]> = {}) {
  const onUpload = vi.fn().mockResolvedValue(undefined);
  const onRemove = vi.fn().mockResolvedValue(undefined);
  render(
    <FileUpload
      label="Logo"
      shape="square"
      current={null}
      onUpload={onUpload}
      onRemove={onRemove}
      {...overrides}
    />,
  );
  return { onUpload, onRemove, input: screen.getByLabelText('Logo') };
}

describe('<FileUpload>', () => {
  it('uploads the chosen file', async () => {
    const { onUpload, input } = setup();
    fireEvent.change(input, { target: { files: [png(64)] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
  });

  it('refuses a type the server would refuse, without sending it', async () => {
    const { onUpload, input } = setup();
    fireEvent.change(input, { target: { files: [png(64, 'application/pdf')] } });

    expect((await screen.findByRole('alert')).textContent).toContain('PNG, JPEG or WebP');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('names both numbers when the file is too big', async () => {
    const { onUpload, input } = setup({ maxBytes: 1024 });
    fireEvent.change(input, { target: { files: [png(4096)] } });

    // "That file is too large" tells you nothing you can act on.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/is 0/);
    expect(alert.textContent).toMatch(/limit is 0/);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows the server message when the upload fails, inline and not as a toast', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('nope'));
    render(
      <FileUpload label="Logo" shape="square" current={null} onUpload={onUpload} onRemove={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Logo'), { target: { files: [png(64)] } });

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('offers Remove only when there is something to remove', async () => {
    const { onRemove } = setup({ current: '/api/v1/files/abc' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
  });

  it('renders read-only without the capability — the image shows, the actions do not', () => {
    setup({ current: '/api/v1/files/abc', disabled: true });
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Logo').disabled).toBe(true);
  });
});
