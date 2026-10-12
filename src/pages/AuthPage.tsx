import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'register' | 'reset';

function mapError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码错误。';
  }
  if (message.includes('Email not confirmed')) {
    return '请先验证邮箱后再登录。';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return '该邮箱已被注册。';
  }
  return message;
}

export function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEmail('');
    setPassword('');
    setError('');
  }

  function switchMode(m: AuthMode) {
    setMode(m);
    resetForm();
    setSuccess('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('请填写邮箱和密码。');
      return;
    }

    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(mapError(result.error));
      return;
    }

    navigate('/', { replace: true });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password) {
      setError('请填写邮箱和密码。');
      return;
    }

    if (password.length < 6) {
      setError('密码至少需要 6 位。');
      return;
    }

    setSubmitting(true);
    const result = await signUp(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(mapError(result.error));
      return;
    }

    resetForm();
    // Firebase registration signs the user in directly and sends no
    // confirmation email, so there is no message to show here.
    navigate('/', { replace: true });
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('请填写邮箱。');
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(email.trim());
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    resetForm();
    setSuccess('重置链接已发送，请查收邮箱。若未收到，请确认邮箱是否已注册。');
  }

  const isReset = mode === 'reset';

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <div className="flex flex-1 flex-col justify-center px-8 pb-8 pt-4">
        <section className="space-y-6">
          <h1 className="text-center text-2xl font-semibold">Mind Relax</h1>

          <div className="flex border-b border-app-input-border">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-3 text-center text-base font-medium ${
                mode === 'login'
                  ? 'border-b-2 border-app-primary text-app-text'
                  : 'text-app-muted'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-3 text-center text-base font-medium ${
                mode === 'register'
                  ? 'border-b-2 border-app-primary text-app-text'
                  : 'text-app-muted'
              }`}
            >
              注册
            </button>
          </div>

          {success && (
            <div className="rounded-md bg-app-primary px-4 py-3 text-sm text-app-text">
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {isReset ? (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-app-muted">
                输入注册邮箱，我们将发送重置密码的链接。
              </p>

              <div>
                <label className="mb-1 block text-sm text-app-muted" htmlFor="email">
                  邮箱
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base text-app-text focus:border-app-primary focus:outline-none"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
              >
                {submitting ? '请稍候…' : '发送重置链接'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={mode === 'login' ? handleLogin : handleRegister}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm text-app-muted" htmlFor="email">
                  邮箱
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base text-app-text focus:border-app-primary focus:outline-none"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-app-muted" htmlFor="password">
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base text-app-text focus:border-app-primary focus:outline-none"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {mode === 'register' && (
                  <p className="mt-1 text-xs text-app-muted">至少 6 位</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
              >
                {submitting ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
              </button>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="w-full text-center text-sm text-app-muted"
                >
                  忘记密码？
                </button>
              )}
            </form>
          )}

          <p className="text-center text-xs text-app-muted">
            {isReset
              ? '想起密码了？回到「登录」'
              : '没有账号？切换到「注册」tab 创建一个'}
          </p>
        </section>
      </div>
    </main>
  );
}
