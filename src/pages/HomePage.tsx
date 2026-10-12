import { Link } from 'react-router-dom';
import { t, useI18n } from '../lib/i18n';
import { formatMonthDayWeekday } from '../utils/date';

export function HomePage() {
  useI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg px-8 py-10 text-app-text">
      <div className="flex items-center justify-between pt-6">
        <div className="text-lg font-medium">{formatMonthDayWeekday(Date.now())}</div>
        <Link
          to="/settings"
          className="rounded-md px-2 py-1 text-xl leading-none text-app-muted"
          aria-label={t('common.settings')}
        >
          ⚙
        </Link>
      </div>

      <section className="flex flex-1 flex-col justify-center gap-12">
        <h1 className="text-3xl font-semibold leading-tight">
          {t('home.tagline')}
        </h1>

        <nav className="flex flex-col gap-5">
          <Link
            to="/record"
            className="flex min-h-16 items-center justify-center rounded-md bg-app-primary px-6 text-lg font-semibold text-app-text"
          >
            {t('home.newEntry')}
          </Link>
          <Link
            to="/review"
            className="flex min-h-16 items-center justify-center rounded-md bg-app-primary px-6 text-lg font-semibold text-app-text"
          >
            {t('home.review')}
          </Link>
        </nav>
      </section>

      <div className="pb-2 text-center text-sm text-app-muted">v0.5</div>
    </main>
  );
}
