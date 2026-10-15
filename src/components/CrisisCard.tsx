import { t, useI18n } from '../lib/i18n';

interface Helpline {
  region: string;
  name: string;
  /** Digits only, used for the tel: link. */
  dial: string;
  display: string;
}

/** Free, 24-hour lines in the regions the app is used in. */
const HELPLINES: Helpline[] = [
  { region: 'India', name: 'Tele-MANAS', dial: '14416', display: '14416' },
  { region: 'Singapore', name: 'SOS', dial: '1767', display: '1767' },
  { region: 'Malaysia', name: 'Befrienders KL', dial: '0376272929', display: '03-7627 2929' },
  { region: 'Japan', name: 'よりそいホットライン', dial: '0120279338', display: '0120-279-338' },
  { region: 'South Korea', name: '자살예방상담전화', dial: '109', display: '109' },
  { region: 'China', name: '心理援助热线', dial: '12356', display: '12356' },
  { region: 'Hong Kong', name: 'Samaritans', dial: '23892222', display: '2389 2222' },
  { region: 'Taiwan', name: '安心專線', dial: '1925', display: '1925' },
  { region: 'Australia', name: 'Lifeline', dial: '131114', display: '13 11 14' },
  { region: 'US', name: '988 Lifeline', dial: '988', display: '988' },
  { region: 'UK & Ireland', name: 'Samaritans', dial: '116123', display: '116 123' },
];

/** DOM id so the talk page's help link can scroll the card into view. */
export const CRISIS_CARD_ID = 'crisis-card';

interface CrisisCardProps {
  onHide: () => void;
}

/**
 * CrisisCard lists helplines after a message that mentions suicide or
 * self-harm. It sits in the conversation, not over it, so the user can keep
 * talking; hiding it is always allowed.
 */
export function CrisisCard({ onHide }: CrisisCardProps) {
  useI18n();

  return (
    <section
      id={CRISIS_CARD_ID}
      role="alert"
      className="mt-4 rounded-xl border border-app-primary bg-app-card p-4 shadow-card text-sm leading-6 text-app-text"
    >
      <h2 className="mb-1 text-base font-semibold">{t('crisis.title')}</h2>
      <p className="mb-3 text-app-muted">{t('crisis.body')}</p>
      <ul className="mb-3 space-y-1">
        {HELPLINES.map((line) => (
          <li key={`${line.region}-${line.dial}`} className="flex justify-between gap-3">
            <span className="text-app-muted">
              {line.region} · {line.name}
            </span>
            <a href={`tel:${line.dial}`} className="font-medium text-app-accent">
              {line.display}
            </a>
          </li>
        ))}
      </ul>
      <p className="mb-3 text-app-muted">
        {t('crisis.otherRegions')}{' '}
        <a
          href="https://findahelpline.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-app-accent"
        >
          findahelpline.com
        </a>
      </p>
      <button
        type="button"
        onClick={onHide}
        className="min-h-10 rounded-full border border-app-input-border px-4 text-sm font-medium text-app-muted hover:bg-app-input-bg"
      >
        {t('crisis.hide')}
      </button>
    </section>
  );
}
