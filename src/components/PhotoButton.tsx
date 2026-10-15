import { useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import { readPhoto, shrinkImage, type PhotoReading } from '../lib/photo';
import { Icon } from './Icon';

interface PhotoButtonProps {
  /** Called with the photo's text, its stored id and a local preview URL. */
  onPhoto: (reading: PhotoReading, previewUrl: string) => void;
}

/**
 * PhotoButton adds a photo to the entry: a picture of a handwritten diary
 * page becomes typed text, and any other photo gets a one-line starter the
 * user can build on. On phones the picker offers the camera or the gallery.
 */
export function PhotoButton({ onPhoto }: PhotoButtonProps) {
  useI18n();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const blob = await shrinkImage(file);
      const reading = await readPhoto(blob);
      onPhoto(reading, URL.createObjectURL(blob));
    } catch {
      toast.error(t('ui.photoFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {busy ? (
        <span className="text-sm text-app-muted" role="status">
          {t('ui.photoReading')}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={t('ui.photoAdd')}
        title={t('ui.photoAdd')}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-app-input-border bg-app-card text-app-accent shadow-card hover:border-app-primary disabled:opacity-60"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-muted border-t-transparent" />
        ) : (
          <Icon name="camera" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
