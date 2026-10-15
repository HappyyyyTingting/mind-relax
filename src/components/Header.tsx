import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, useI18n } from '../lib/i18n';
import { Icon } from './Icon';

interface HeaderProps {
  title?: string;
  backTo?: string;
  /** Optional control on the right, e.g. the talk page's help link. */
  right?: ReactNode;
}

/**
 * Header keeps page navigation chrome consistent while allowing pages to omit
 * the title or back button when the design calls for a minimal screen. The
 * side slots share one width so the title stays centred.
 */
export function Header({ title, backTo, right }: HeaderProps) {
  const navigate = useNavigate();
  useI18n();
  const hasBackButton = Boolean(backTo);

  return (
    <header className="flex min-h-12 items-center gap-2 px-3 py-3">
      <div className="flex w-24 justify-start">
        {hasBackButton ? (
          <button
            type="button"
            onClick={() => navigate(backTo ?? '/')}
            className="flex items-center gap-0.5 rounded-md py-1 pl-1 pr-2 text-sm font-medium text-app-text hover:bg-app-card"
          >
            <Icon name="back" className="h-4 w-4" />
            {t('common.back')}
          </button>
        ) : null}
      </div>
      {title ? (
        <h1 className="flex-1 truncate text-center text-base font-semibold text-app-text">
          {title}
        </h1>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex w-24 justify-end">{right}</div>
    </header>
  );
}
