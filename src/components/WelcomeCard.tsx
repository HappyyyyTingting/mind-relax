import { useState } from 'react';
import { t, useI18n } from '../lib/i18n';
import { Icon, type IconName } from './Icon';

const STORAGE_KEY = 'mind_relax_welcome_seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const STEPS: { icon: IconName; key: 'ui.welcomeWrite' | 'ui.welcomeTalk' | 'ui.welcomeRecap' }[] = [
  { icon: 'book', key: 'ui.welcomeWrite' },
  { icon: 'chat', key: 'ui.welcomeTalk' },
  { icon: 'sparkles', key: 'ui.welcomeRecap' },
];

/**
 * WelcomeCard explains the write → talk → recap loop once. Dismissal is a
 * per-device convenience kept in localStorage; if storage is unavailable the
 * card can still be hidden for the current visit.
 */
export function WelcomeCard() {
  useI18n();
  const [seen, setSeen] = useState(readSeen);

  if (seen) return null;

  function dismiss() {
    setSeen(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Private mode or blocked storage: hidden for this visit only.
    }
  }

  return (
    <section className="mx-4 mt-2 rounded-xl border border-app-input-border bg-app-card p-4 shadow-card">
      <h2 className="mb-3 text-base font-semibold">{t('ui.welcomeTitle')}</h2>
      <ul className="space-y-2 text-sm leading-6">
        {STEPS.map((step) => (
          <li key={step.key} className="flex gap-2">
            <Icon name={step.icon} className="mt-1 h-4 w-4 shrink-0 text-app-accent" />
            <span>{t(step.key)}</span>
          </li>
        ))}
        <li className="flex gap-2 text-app-muted">
          <Icon name="lock" className="mt-1 h-4 w-4 shrink-0" />
          <span>{t('ui.welcomePrivacy')}</span>
        </li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 min-h-9 rounded-full bg-app-primary px-4 text-sm font-semibold text-app-text hover:bg-app-primary-hover"
      >
        {t('ui.welcomeDismiss')}
      </button>
    </section>
  );
}
