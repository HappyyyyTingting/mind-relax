import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { ActionSheet } from './ActionSheet';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import { removeTalkMessage, updateTalkMessage } from '../lib/talkSession';
import type { TalkMessage } from '../types/talk';
import { formatTime } from '../utils/date';

const LONG_PRESS_MS = 500;

interface TalkBubbleProps {
  message: TalkMessage;
  /** Present only for the trailing failed/partial message (015 retry rule). */
  onRetry?: () => void;
  /** 015: timestamps show on 5-minute inactivity groups, computed by the list. */
  showTimestamp: boolean;
}

/**
 * TalkBubble renders one talk-page message: user messages on the right in the
 * record style, AI messages on the left in the light style. Long-press offers
 * copy / save-as-record / delete; only the trailing failed or interrupted
 * reply offers a retry action. Streaming messages are not menuable.
 */
export function TalkBubble({ message, onRetry, showTimestamp }: TalkBubbleProps) {
  useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const toast = useToast();

  const isUser = message.role === 'user';
  const copyable = message.content.length > 0 && message.status !== 'streaming';
  const menuable = message.status !== 'streaming';

  function startLongPress() {
    if (!menuable) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => cancelLongPress, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  }

  /** Saves the message as a normal record (createdAt = message time, per Q1). */
  async function handleSaveAsRecord() {
    const now = Date.now();
    try {
      await entryRepository.add({
        id: nanoid(),
        type: 'thought',
        content: message.content,
        createdAt: message.createdAt,
        updatedAt: now,
        metadata: {},
      });
      updateTalkMessage(message.id, { savedAt: now });
      toast.success(t('talk.saveAsRecord'));
    } catch {
      toast.error(t('common.operationFailed'));
    }
  }

  function handleDelete() {
    removeTalkMessage(message.id);
  }

  const actions = [
    ...(copyable
      ? [
          { label: t('common.copy'), onClick: () => void handleCopy() },
          { label: t('talk.saveAsRecord'), onClick: () => void handleSaveAsRecord() },
        ]
      : []),
    { label: t('common.delete'), danger: true, onClick: handleDelete },
  ];

  if (isUser) {
    return (
      <li className="flex justify-end">
        <div
          onTouchStart={startLongPress}
          onTouchMove={cancelLongPress}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
          onContextMenu={(event) => {
            event.preventDefault();
            if (menuable) setMenuOpen(true);
          }}
          className="flex max-w-[78%] select-none flex-col items-end"
        >
          {showTimestamp ? (
            <span className="mb-1 px-1 text-xs text-app-muted">
              {formatTime(message.createdAt)}
            </span>
          ) : null}
          <p className="whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-app-primary px-4 py-3 text-base leading-7 text-app-text">
            {message.content}
          </p>
        </div>
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          actions={actions}
        />
      </li>
    );
  }

  return (
    <li className="flex justify-start">
      <div className="flex max-w-[78%] flex-col items-start">
        {showTimestamp ? (
          <span className="mb-1 px-1 text-xs text-app-muted">
            {formatTime(message.createdAt)}
          </span>
        ) : null}

        <div
          onTouchStart={startLongPress}
          onTouchMove={cancelLongPress}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
          onContextMenu={(event) => {
            event.preventDefault();
            if (menuable) setMenuOpen(true);
          }}
          className="whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-app-input-border bg-app-card px-4 py-3 text-base leading-7 text-app-text"
        >
          {message.status === 'failed' ? (
            <span className="text-app-muted">{t('talk.replyFailed')}</span>
          ) : (
            message.content
          )}
          {message.status === 'streaming' ? (
            <span className="animate-pulse">▍</span>
          ) : null}
        </div>

        {onRetry &&
        (message.status === 'failed' || message.status === 'partial') ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 px-1 text-xs text-app-muted underline"
          >
            {message.status === 'failed' ? t('talk.retryTap') : t('talk.retryInterrupted')}
          </button>
        ) : null}

        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          actions={actions}
        />
      </div>
    </li>
  );
}
