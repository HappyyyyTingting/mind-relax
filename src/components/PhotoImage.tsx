import { useEffect, useState } from 'react';
import { photoUrl } from '../lib/photo';

interface PhotoImageProps {
  id: string;
  className?: string;
}

/**
 * PhotoImage shows one of the user's journal photos. The photo is private, so
 * it is fetched with the user's sign-in instead of a public link; while it
 * loads (or if it is gone) a soft placeholder keeps the layout steady.
 */
export function PhotoImage({ id, className = '' }: PhotoImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    photoUrl(id)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id]);

  return src ? (
    <img src={src} alt="" className={`object-cover ${className}`} />
  ) : (
    <span className={`block bg-app-input-bg ${className}`} aria-hidden="true" />
  );
}
