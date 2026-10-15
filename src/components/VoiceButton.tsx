import { useEffect, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import {
  MAX_RECORDING_MS,
  VoiceError,
  pickMimeType,
  transcribeAudio,
} from '../lib/voice';
import { Icon } from './Icon';

type Status = 'idle' | 'recording' | 'transcribing';

interface VoiceButtonProps {
  /** Called with the transcribed words; the page adds them to the box. */
  onText: (text: string) => void;
}

function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * VoiceButton lets someone speak their entry instead of typing it: tap to
 * record, tap again to stop, and Gemini turns the clip into text that lands
 * in the journal box for the user to check before saving.
 */
export function VoiceButton({ onText }: VoiceButtonProps) {
  useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tickRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  function clearTimers() {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    tickRef.current = null;
    stopTimerRef.current = null;
  }

  // Leaving the page mid-recording releases the microphone without sending.
  useEffect(
    () => () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    },
    [],
  );

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(t('ui.voiceDenied'));
      return;
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      void finish(blob);
    };
    recorderRef.current = recorder;
    recorder.start();
    setElapsed(0);
    setStatus('recording');
    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => setElapsed(Date.now() - startedAt), 250);
    stopTimerRef.current = window.setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
  }

  async function finish(blob: Blob) {
    if (blob.size === 0) {
      setStatus('idle');
      toast.error(t('ui.voiceEmpty'));
      return;
    }
    setStatus('transcribing');
    try {
      onText(await transcribeAudio(blob));
    } catch (err) {
      const reason = err instanceof VoiceError ? err.reason : 'failed';
      toast.error(reason === 'empty' ? t('ui.voiceEmpty') : t('ui.voiceFailed'));
    } finally {
      setStatus('idle');
    }
  }

  function handleClick() {
    if (status === 'idle') void start();
    else if (status === 'recording') recorderRef.current?.stop();
  }

  const label =
    status === 'recording'
      ? t('ui.voiceStop')
      : status === 'transcribing'
        ? t('ui.voiceTranscribing')
        : t('ui.voiceStart');

  return (
    <div className="flex items-center gap-2">
      {status !== 'idle' ? (
        <span className="text-sm text-app-muted" role="status">
          {status === 'recording'
            ? t('ui.voiceListening', { time: formatClock(elapsed) })
            : t('ui.voiceTranscribing')}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'transcribing'}
        aria-label={label}
        title={label}
        className={
          status === 'recording'
            ? 'flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-card'
            : 'flex h-11 w-11 items-center justify-center rounded-full border border-app-input-border bg-app-card text-app-accent shadow-card hover:border-app-primary disabled:opacity-60'
        }
      >
        {status === 'recording' ? (
          <span className="h-3.5 w-3.5 animate-pulse rounded-sm bg-white" />
        ) : status === 'transcribing' ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-muted border-t-transparent" />
        ) : (
          <Icon name="mic" />
        )}
      </button>
    </div>
  );
}
