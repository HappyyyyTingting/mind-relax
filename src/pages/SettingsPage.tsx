import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { LANGUAGES, setLang, t, useI18n, type Lang } from '../lib/i18n';

export function SettingsPage() {
  const lang = useI18n();
  const entries = [
    { to: '/settings/account', label: t('settings.account') },
    { to: '/settings/sync', label: t('settings.sync') },
    { to: '/settings/ai-model', label: t('settings.aiModel') },
    { to: '/settings/data', label: t('settings.data') },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('settings.title')} backTo="/" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <nav className="flex flex-col divide-y divide-app-input-border overflow-hidden rounded-xl border border-app-input-border bg-app-card shadow-card">
          {entries.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="flex min-h-12 items-center justify-between px-4 text-base text-app-text hover:bg-app-input-bg"
            >
              {entry.label}
              <Icon name="chevron" className="h-4 w-4 text-app-muted" />
            </Link>
          ))}
          <div className="flex min-h-12 items-center justify-between px-4 text-base">
            <span className="text-app-text">{t('settings.language')}</span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as Lang)}
              aria-label={t('settings.language')}
              className="min-h-10 rounded-lg border border-app-input-border bg-app-card px-2 text-sm text-app-text"
            >
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </nav>
      </div>
    </main>
  );
}
