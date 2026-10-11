import { useEffect, useRef } from 'react';
import type { Entry } from '../types/entry';
import { formatTime } from '../utils/date';

const LONG_PRESS_MS = 500;

interface MessageBubbleProps {
  entry: Entry;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onLongPress: (id: string) => void;
}

/**
 * MessageBubble renders one record as a chat bubble with its send time above.
 * Long-press (touch ~500ms, or desktop context menu) opens the action sheet;
 * in selection mode tapping the bubble toggles its checkbox instead.
 */
export function MessageBubble({
  entry,
  selectionMode,
  selected,
  onToggleSelect,
  onLongPress,
}: MessageBubbleProps) {
  const timerRef = useRef<number | null>(null);

  function startLongPress() {
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onLongPress(entry.id);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => cancelLongPress, []);

  return (
    <li className="flex items-end justify-end gap-2">
      {selectionMode ? (
        <button
          type="button"
          onClick={() => onToggleSelect(entry.id)}
          className="mb-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-app-input-border bg-app-card"
          aria-label={selected ? '取消选择' : '选择'}
        >
          {selected ? <span className="h-3 w-3 rounded-full bg-app-primary" /> : null}
        </button>
      ) : null}

      <div
        onTouchStart={startLongPress}
        onTouchMove={cancelLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          onLongPress(entry.id);
        }}
        onClick={selectionMode ? () => onToggleSelect(entry.id) : undefined}
        className="flex max-w-[78%] select-none flex-col items-end"
      >
        <span className="mb-1 px-1 text-xs text-app-muted">
          {formatTime(entry.createdAt)}
        </span>
        <p className="whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-app-primary px-4 py-3 text-base leading-7 text-app-text">
          {entry.content}
        </p>
      </div>
    </li>
  );
}
