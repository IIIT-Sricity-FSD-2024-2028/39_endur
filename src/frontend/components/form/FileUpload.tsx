// <FileUpload> — 24 §5, 48 § Components.
//
// A real `<input type="file">` underneath, with the drop zone as an enhancement rather than
// the only path. Same reasoning as <Toggle>: everything a file input already does — keyboard
// access, the picker, the accessibility tree — costs nothing to keep and is expensive to
// rebuild badly.
//
// The client-side checks here MIRROR the server's and never replace them (48, 14 §7). They
// exist so a 4 MB photo fails instantly instead of after a 4 MB round trip; the request is
// still refused server-side if someone skips them.
import { useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/api.js';

/** The three the server accepts, and the reason a fourth cannot be added here alone. */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export function FileUpload({
  current,
  onUpload,
  onRemove,
  shape,
  label,
  hint,
  maxBytes = DEFAULT_MAX_BYTES,
  disabled = false,
}: {
  /** The image already stored, as a URL, or null. */
  current: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape: 'circle' | 'square';
  label: string;
  hint?: string | undefined;
  maxBytes?: number;
  disabled?: boolean;
}): JSX.Element {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A local preview so the image appears at once. Revoked as soon as the real URL lands. */
  const [preview, setPreview] = useState<string | null>(null);

  const megabytes = Math.round((maxBytes / 1024 / 1024) * 10) / 10;

  async function handle(file: File | undefined): Promise<void> {
    if (!file || disabled || busy) return;
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > maxBytes) {
      // The number, not "too large". A limit you cannot see is a limit you cannot meet.
      const size = Math.round((file.size / 1024 / 1024) * 10) / 10;
      setError(`That file is ${size} MB. The limit is ${megabytes} MB.`);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      // The server's message is the specific one — which rule failed, and what to do about
      // it — so it is shown rather than replaced with a generic string (48 § Validation).
      setError(err instanceof ApiError ? err.message : 'That upload did not work. Try again.');
      setPreview(null);
    } finally {
      URL.revokeObjectURL(localUrl);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(): Promise<void> {
    if (disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove();
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? current;

  return (
    <div className="field file-upload">
      <label htmlFor={inputId}>{label}</label>

      <div
        className={`file-drop shape-${shape}${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          void handle(event.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          <img src={shown} alt="" className={`file-preview shape-${shape}`} />
        ) : (
          // Never a broken-image icon (48 § States).
          <span className={`file-placeholder shape-${shape}`} aria-hidden="true" />
        )}

        <div className="file-actions">
          <input
            id={inputId}
            ref={input}
            type="file"
            accept={ACCEPTED.join(',')}
            disabled={disabled || busy}
            onChange={(event) => void handle(event.target.files?.[0])}
          />
          {shown && !disabled && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => void remove()} disabled={busy}>
              Remove
            </button>
          )}
        </div>
      </div>

      {busy && <p className="field-help">Uploading…</p>}
      {hint && !busy && !error && <p className="field-help">{hint}</p>}
      {/* Inline, under the control — never a toast (24 §6). */}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
