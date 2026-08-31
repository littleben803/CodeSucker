import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type AppAlertConfirmTone = 'primary' | 'danger';

interface AppAlertProps {
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmTone?: AppAlertConfirmTone;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function AppAlert({
  title,
  description,
  cancelLabel = '取消',
  confirmLabel = '确定',
  confirmTone = 'primary',
  onCancel,
  onConfirm,
}: AppAlertProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    cancelButtonRef.current?.focus();

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      previouslyFocused?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="app-alert-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        className="app-alert-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="app-alert-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <div className="app-alert-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn-ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`app-alert-dialog__confirm${confirmTone === 'danger' ? ' is-danger' : ' btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
