import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { t, useI18n } from '../lib/i18n';

export function ResetPasswordPage() {
  useI18n();
  const { confirmPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t('auth.weakPassword'));
      return;
    }

    if (password !== confirm) {
      setError(t('reset.mismatch'));
      return;
    }

    setSubmitting(true);
    const result = await confirmPasswordReset(oobCode, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    navigate('/', { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <div className="flex flex-1 flex-col justify-center px-8 pb-8 pt-4">
        <section className="space-y-6">
          <h1 className="text-center text-2xl font-semibold">{t('reset.title')}</h1>

          {error && (
            <div className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-app-muted" htmlFor="password">
                {t('reset.newPassword')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base text-app-text focus:border-app-primary focus:outline-none"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-app-muted">{t('auth.minChars')}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm text-app-muted" htmlFor="confirm">
                {t('reset.confirmPassword')}
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base text-app-text focus:border-app-primary focus:outline-none"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
            >
              {submitting ? t('common.pleaseWait') : t('reset.update')}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
