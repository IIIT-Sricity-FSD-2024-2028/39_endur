// An image picker with a drop zone. Its state (dragging, busy, the error, the preview) is
// this instance's entry in `state.widgets.uploads`; the upload itself is the page's command,
// handed in as `onUpload`. The `File` never enters the store: only a preview URL does.
import { useId, useRef } from 'react';
import { ApiError } from '../../lib/api.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import {
  selectUpload,
  uploadDragChanged,
  uploadFinished,
  uploadLeft,
  uploadRefused,
  uploadStarted,
} from '../../store/screens/widgets.js';

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
  const dispatch = useAppDispatch();
  const id = inputId;
  const { busy, dragging, error, preview } = useAppSelector((state) => selectUpload(state, id));
  useClearOnLeave(uploadLeft({ id }));

  const megabytes = Math.round((maxBytes / 1024 / 1024) * 10) / 10;

  async function handle(file: File | undefined): Promise<void> {
    if (!file || disabled || busy) return;

    if (!ACCEPTED.includes(file.type)) {
      dispatch(uploadRefused({ id, error: 'Use a PNG, JPEG or WebP image.' }));
      return;
    }
    if (file.size > maxBytes) {
      const size = Math.round((file.size / 1024 / 1024) * 10) / 10;
      dispatch(uploadRefused({ id, error: `That file is ${size} MB. The limit is ${megabytes} MB.` }));
      return;
    }

    const localUrl = URL.createObjectURL(file);
    dispatch(uploadStarted({ id, preview: localUrl }));
    let failure: string | null = null;
    try {
      await onUpload(file);
    } catch (err) {
      failure = err instanceof ApiError ? err.message : 'That upload did not work. Try again.';
    } finally {
      dispatch(uploadFinished({ id, error: failure }));
      URL.revokeObjectURL(localUrl);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(): Promise<void> {
    if (disabled || busy) return;
    dispatch(uploadStarted({ id, preview: null }));
    let failure: string | null = null;
    try {
      await onRemove();
    } catch (err) {
      failure = err instanceof ApiError ? err.message : 'That did not work. Try again.';
    }
    dispatch(uploadFinished({ id, error: failure }));
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
          // dragover fires continuously: only the change into "dragging" is recorded.
          if (!dragging) dispatch(uploadDragChanged({ id, dragging: true }));
        }}
        onDragLeave={() => dispatch(uploadDragChanged({ id, dragging: false }))}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          dispatch(uploadDragChanged({ id, dragging: false }));
          void handle(event.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          <img src={shown} alt="" className={`file-preview shape-${shape}`} />
        ) : (
          <span className={`file-placeholder shape-${shape}`} aria-hidden="true" />
        )}

        <div className="file-actions">
          {/* THE BROWSER'S OWN CONTROL, HIDDEN BUT KEPT. "Choose File · No file chosen" is
              drawn by the browser in its own font and colours, on every theme; the styled
              label below opens the same picker. The input stays the thing that is labelled,
              focused and changed, so a keyboard and a screen reader meet a real file field. */}
          <input
            id={inputId}
            ref={input}
            type="file"
            className="file-input"
            accept={ACCEPTED.join(',')}
            disabled={disabled || busy}
            onChange={(event) => void handle(event.target.files?.[0])}
          />
          {!disabled && (
            <>
              <label htmlFor={inputId} className={`btn btn-secondary file-pick${busy ? ' is-busy' : ''}`}>
                {shown ? 'Replace' : 'Choose an image'}
              </label>
              {shown && (
                <button type="button" className="btn btn-danger-ghost" onClick={() => void remove()} disabled={busy}>
                  Remove
                </button>
              )}
              <span className="text-meta file-drop-hint">or drop one here</span>
            </>
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
