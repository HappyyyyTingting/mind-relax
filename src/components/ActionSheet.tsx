interface ActionSheetAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  actions: ActionSheetAction[];
}

/**
 * ActionSheet is a WeChat-style bottom sheet for long-press menus. The
 * backdrop closes it; every action also closes it after running.
 */
export function ActionSheet({ open, onClose, actions }: ActionSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="关闭菜单"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative mb-4 w-[calc(100%-2rem)] max-w-[440px]">
        <div className="divide-y divide-app-input-border overflow-hidden rounded-xl bg-app-card text-app-text">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                action.onClick();
                onClose();
              }}
              className={`block min-h-12 w-full text-base ${
                action.danger ? 'text-red-500' : ''
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 block min-h-12 w-full rounded-xl bg-app-card text-base text-app-text"
        >
          取消
        </button>
      </div>
    </div>
  );
}
