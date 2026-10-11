import { Link } from 'react-router-dom';
import { Header } from '../components/Header';

const entries = [
  { to: '/settings/account', label: '账户' },
  { to: '/settings/sync', label: '云同步' },
  { to: '/settings/ai-model', label: 'AI 模型' },
  { to: '/settings/data', label: '数据管理' },
];

export function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="设置" backTo="/" />

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
        </nav>
      </div>
    </main>
  );
}
