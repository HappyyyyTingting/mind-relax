import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { setLang, t, useI18n } from '../lib/i18n';

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
        <nav className="flex flex-col divide-y divide-app-input-border overflow-hidden rounded-lg border border-app-input-border bg-app-card">
          {entries.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="flex min-h-12 items-center justify-between px-4 text-base text-app-text"
            >
              {entry.label}
              <span className="text-app-muted">▸</span>
            </Link>
          ))}
          <div className="flex min-h-12 items-center justify-between px-4 text-base">
            <span className="text-app-text">{t('settings.language')}</span>
            <div className="flex items-center gap-3 text-sm">
              {(['zh', 'en'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLang(option)}
                  className={
                    lang === option
                      ? 'font-medium text-app-primary'
                      : 'text-app-muted'
                  }
                >
                  {t(option === 'zh' ? 'settings.languageZh' : 'settings.languageEn')}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </main>
  );
}
