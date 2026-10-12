import type { I18nKey } from './i18n';
import { t } from './i18n';

/**
 * CodedError carries an i18n key (+ optional interpolation vars) instead of a
 * hardcoded message, so services can classify failures and the UI can render
 * them in the current language. Pages surface them via localizedError.
 */
export class CodedError extends Error {
  constructor(
    public code: I18nKey,
    public vars?: Record<string, string | number>,
  ) {
    super(code);
    this.name = 'CodedError';
  }
}

/** CodedError → t(code, vars); anything else → the fallback message. */
export function localizedError(err: unknown, fallback: I18nKey): string {
  if (err instanceof CodedError) return t(err.code, err.vars);
  return t(fallback);
}
