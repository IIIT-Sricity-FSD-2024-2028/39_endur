// Draws the store's toast. One per shell (console, ops), never one per page (R-307).
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { selectToast, toastDismissed } from '../../store/uiSlice.js';
import { Toast } from './Toast.js';

export function ToastHost(): JSX.Element | null {
  const toast = useAppSelector(selectToast);
  const dispatch = useAppDispatch();

  const id = toast?.id;
  const dismiss = useCallback(() => {
    if (id) dispatch(toastDismissed({ id }));
  }, [dispatch, id]);

  if (!toast) return null;

  const { undo } = toast;
  return (
    <Toast
      // A new toast is a new element, so its four-second timer starts from zero.
      key={toast.id}
      message={toast.message}
      undo={undo ? () => { dispatch(undo); dismiss(); } : undefined}
      onDismiss={dismiss}
    />
  );
}
