import { useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/api.js';

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
