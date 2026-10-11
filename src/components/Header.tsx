import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title?: string;
  backTo?: string;
}

/**
 * Header keeps page navigation chrome consistent while allowing pages to omit
 * the title or back button when the design calls for a minimal screen.
 */
export function Header({ title, backTo }: HeaderProps) {
  const navigate = useNavigate();
  const hasBackButton = Boolean(backTo);

  return (
    <header className="flex min-h-12 items-center px-4 py-3">
      {hasBackButton ? (
        <button
          type="button"
          onClick={() => navigate(backTo ?? '/')}
          className="rounded-md px-2 py-1 text-sm font-medium text-app-text"
        >
          ← 返回
        </button>
      ) : null}
      {title ? (
        <h1 className="flex-1 text-center text-base font-semibold text-app-text">
          {title}
        </h1>
      ) : (
        <div className="flex-1" />
      )}
      {hasBackButton ? <div className="w-[52px]" aria-hidden="true" /> : null}
    </header>
  );
}
