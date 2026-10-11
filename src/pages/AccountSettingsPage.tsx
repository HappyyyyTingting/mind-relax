import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';

export function AccountSettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const toast = useToast();

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch {
      toast.error('退出失败，请重试。');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="账户" backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          {user ? (
            <div className="space-y-3">
              <p className="text-sm text-app-muted">{user.email}</p>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="text-sm text-red-600"
              >
                {isSigningOut ? '退出中…' : '退出登录'}
              </button>
            </div>
          ) : (
            <div>
              <Link
                to="/auth"
                className="min-h-12 inline-flex items-center justify-center rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text"
              >
                登录 / 注册
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
