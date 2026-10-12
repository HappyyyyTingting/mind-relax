import { useSyncExternalStore } from 'react';

/**
 * Minimal i18n: a flat string dictionary for the static UI (016-2, task ①).
 * AI-generated content is NOT translated — the prompts in aiClient.ts stay
 * Chinese. `en` is the source of truth for keys; `zh` is compile-checked
 * against it so a missing translation fails the build.
 */

export type Lang = 'zh' | 'en';

const en = {
  // common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.copy': 'Copy',
  'common.retry': 'Retry',
  'common.settings': 'Settings',
  'common.back': '← Back',
  'common.operationFailed': 'Operation failed. Please try again.',
  'common.loading': 'Loading…',
  'common.pleaseWait': 'Please wait…',
  'common.send': 'Send',
  'common.confirmDeleteEntry': 'Delete this entry?',
  'common.entryNotFound': 'Entry not found',
  'common.backToReview': 'Back to review',
  'common.deleted': 'Deleted',
  'common.copied': 'Copied',
  'common.copyFailed': 'Copy failed. Please try again.',
  'common.enterContent': 'Please enter some content.',
  'common.closeMenu': 'Close menu',
  'common.select': 'Select',
  'common.deselect': 'Deselect',
  'common.thoughtPlaceholder': 'Write down any thought...',
  // chat
  'chat.summary': 'Recap',
  'chat.summarizing': 'Recap…',
  'chat.review': 'Review',
  'chat.talkEntry': '🎧 Talk with AI',
  'chat.merge': 'Merge',
  'chat.mergeCount': 'Merge ({n})',
  'chat.mergeConfirm': 'Merge {n} entries into one',
  'chat.merged': 'Merged',
  'chat.summaryFailed': "Couldn't generate the recap. Please try again.",
  'chat.configureModelFirst': 'Configure a model in Settings first.',
  'chat.localModelNotReady': 'Local model not ready. Download or import it in Settings.',
  'chat.greetingMorning': 'Good morning',
  'chat.greetingAfternoon': 'Good afternoon',
  'chat.greetingEvening': 'Good evening',
  'chat.multiSelect': 'Select multiple',
  // talk
  'talk.noModelBanner':
    'No model configured yet. Set up the baseURL, API key and model name in Settings to start the conversation.',
  'talk.localNotReadyBanner':
    "The local model isn't ready. Download or import it in Settings (about 2 GB), then the conversation runs entirely on this device.",
  'talk.goSettings': 'Go to settings',
  'talk.placeholder': 'Say something to the AI…',
  'talk.replying': 'Replying…',
  'talk.scrollToBottom': 'Back to bottom',
  'talk.saveAsRecord': 'Save as entry',
  'talk.replyFailed': 'Reply failed',
  'talk.retryTap': 'Tap to retry',
  'talk.retryInterrupted': 'Reply interrupted — tap to retry',
  // home
  'home.tagline': "What's on your mind today?",
  'home.newEntry': 'New entry',
  'home.review': 'Review',
  // record
  'record.editTitle': 'Edit entry',
  'record.updated': 'Updated',
  'record.savedWithLimit': 'Saved (up to 10,000 characters)',
  // review
  'review.clearSearch': 'Clear search',
  'review.empty': 'No entries yet. Write your first one!',
  'review.noMatch': 'No matching entries.',
  // settings
  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.sync': 'Cloud sync',
  'settings.aiModel': 'AI model',
  'settings.data': 'Data management',
  'settings.language': 'Language',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  // account
  'account.signOut': 'Sign out',
  'account.signingOut': 'Signing out…',
  'account.signOutFailed': 'Sign out failed. Please try again.',
  'account.loginRegister': 'Log in / Sign up',
  // sync
  'sync.description': 'Your entries sync automatically across signed-in devices.',
  'sync.never': 'Never synced',
  'sync.syncing': 'Syncing…',
  'sync.lastSync': 'Last sync: {time}',
  'sync.failed': 'Sync failed',
  // data
  'data.export': 'Export backup',
  'data.exporting': 'Exporting…',
  'data.exportSuccess': 'Backup exported.',
  'data.exportFailed': 'Export failed. Please try again.',
  'data.exportEmpty': "No entries yet — you can still export an empty backup.",
  'data.exportCount': '{n} entries in total.',
  'data.import': 'Import backup',
  'data.importHint':
    'Choose a backup file. Importing merges with your existing data and never overwrites newer entries.',
  'data.importing': 'Importing…',
  'data.importNew': '{n} added',
  'data.importUpdated': '{n} updated',
  'data.importSkipped': '{n} skipped',
  'data.importDone': 'Import complete: {detail}.',
  'data.importDoneSimple': 'Import complete.',
  'data.importFailed': 'Import failed. Please try again.',
  'data.importRolledBack': 'Import failed — changes were rolled back. Please try again.',
  'data.importDetailSep': ', ',
  'data.importConfirmTitle': 'Confirm backup import',
  'data.importEntryCount': 'Entry count',
  'data.importEntryCountValue': '{n}',
  'data.importTimeRange': 'Time range',
  'data.importExportTime': 'Export time',
  'data.importEmpty': 'This backup contains no entries.',
  'data.importConfirm': 'Confirm import',
  // auth
  'auth.invalidCredential': 'Incorrect email or password.',
  'auth.emailInUse': 'This email is already registered.',
  'auth.weakPassword': 'Password must be at least 6 characters.',
  'auth.userNotFound': 'This email is not registered.',
  'auth.tooManyRequests': 'Too many attempts. Please try again later.',
  'auth.requiresRecentLogin': 'For security, please log in again and retry.',
  'auth.expiredCode': 'Link expired. Please request a new password reset.',
  'auth.invalidCode': 'Invalid link. Please request a new password reset.',
  'auth.operationFailed': 'Operation failed. Please try again later.',
  'auth.login': 'Log in',
  'auth.register': 'Sign up',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.fillBoth': 'Enter your email and password.',
  'auth.fillEmail': 'Enter your email.',
  'auth.minChars': 'At least 6 characters',
  'auth.resetLinkSent':
    "Reset link sent — check your inbox. If you don't see it, make sure this email is registered.",
  'auth.resetHint': "Enter your registered email and we'll send a password reset link.",
  'auth.sendResetLink': 'Send reset link',
  'auth.forgotPassword': 'Forgot password?',
  'auth.backToLogin': 'Remembered your password? Go back to Log in.',
  'auth.noAccount': 'No account? Switch to the Sign up tab to create one.',
  // reset
  'reset.title': 'Reset password',
  'reset.newPassword': 'New password',
  'reset.confirmPassword': 'Confirm new password',
  'reset.mismatch': "The two passwords don't match.",
  'reset.update': 'Update password',
  // backup (BackupService.validate errors)
  'backup.parseFailed': "File couldn't be parsed.",
  'backup.invalidFormat': 'Invalid backup file format.',
  'backup.versionNotInteger': 'Invalid backup format: version must be an integer.',
  'backup.unsupportedVersion': 'Unsupported backup version (current: {v}).',
  'backup.notMindRelax': 'This is not a mind_relax backup file.',
  'backup.invalidExportTime': 'Invalid backup format: missing or invalid exportTime field.',
  'backup.missingEntries': 'Invalid backup format: missing entries field.',
  // model (settings page + modelStore errors)
  'model.localMode': 'On-device model',
  'model.httpMode': 'Custom server',
  'model.modeHint':
    'Choose how the model runs. baseURL and model name sync across devices; the API key stays in this browser only.',
  'model.localHint':
    'Runs a Gemma model in your browser: your words never leave the device, and it works offline. Download the model file once — it stays on this device.',
  'model.statusChecking': 'Checking…',
  'model.downloadProgress': '{done} MB / {total} MB downloaded ({pct}%)',
  'model.readyStatus': 'Ready · {gb} GB · inference runs entirely in this browser',
  'model.notReadyStatus': 'Not ready · the model is about {gb} GB — download it once, then it works offline',
  'model.download': 'Download model',
  'model.downloading': 'Downloading…',
  'model.import': 'Import model file',
  'model.importing': 'Importing…',
  'model.imported': 'Model imported',
  'model.deleteConfirm': "Delete the local model? You'll need to download it again.",
  'model.deleteFailed': 'Delete failed. Please try again.',
  'model.downloadFailed': 'Download failed. Please try again.',
  'model.importFailed': 'Import failed. Please try again.',
  'model.saveFailed': 'Save failed. Please try again.',
  'model.saved': 'Saved',
  'model.httpHint': 'Configure an OpenAI-compatible model service (a cloud API or your own server).',
  'model.baseUrlPlaceholder':
    'baseURL, e.g. https://api.openai.com/v1 or http://localhost:11434/v1',
  'model.apiKeyPlaceholder': 'API Key',
  'model.apiKeyHint': 'Stored in this browser only; can be anything in local mode.',
  'model.apiKeyMismatch':
    'The cloud config updated the baseURL — make sure the API key still works with it.',
  'model.modelPlaceholder': 'Model name, e.g. gpt-4o-mini',
  'model.modelName': 'Model name',
  'model.cloudPrivacy': 'With a cloud model, your entries are sent to that provider for processing.',
  'model.notReady': 'Local model not ready',
  'model.downloadHttpFailed': 'Download failed: HTTP {status}',
  'model.downloadIncomplete': 'Download incomplete. Please try again.',
  'model.importSizeMismatch': 'File size mismatch: gemma-4-E2B-it-web.litertlm (about 2 GB) is required',
  'model.downloadNetwork': 'Download failed: network error. Check your connection and try again.',
  'model.diskQuota': 'Not enough storage space to save the model file',
  'model.preset': 'Preset',
  'model.presetCustom': 'Custom',
  'model.presetVertex': 'Vertex AI',
  'model.vertexRegion': 'Region',
  'model.vertexProject': 'Project ID',
  'model.vertexLocation': 'Location',
  'model.vertexHint':
    'Composes the Vertex AI OpenAI-compatible endpoint URL; requires a service account API key.',
  // date
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
} as const;

const zh: Record<keyof typeof en, string> = {
  // common
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.copy': '复制',
  'common.retry': '重试',
  'common.settings': '设置',
  'common.back': '← 返回',
  'common.operationFailed': '操作失败，请重试。',
  'common.loading': '加载中…',
  'common.pleaseWait': '请稍候…',
  'common.send': '发送',
  'common.confirmDeleteEntry': '确定要删除这条记录吗？',
  'common.entryNotFound': '记录不存在',
  'common.backToReview': '返回历史页',
  'common.deleted': '已删除',
  'common.copied': '已复制',
  'common.copyFailed': '复制失败，请重试。',
  'common.enterContent': '请输入内容',
  'common.closeMenu': '关闭菜单',
  'common.select': '选择',
  'common.deselect': '取消选择',
  'common.thoughtPlaceholder': '写下你脑中的任何想法...',
  // chat
  'chat.summary': '小结',
  'chat.summarizing': '小结中…',
  'chat.review': '回看',
  'chat.talkEntry': '🎧 和 AI 聊聊',
  'chat.merge': '合并',
  'chat.mergeCount': '合并（{n}）',
  'chat.mergeConfirm': '将合并 {n} 条为一条记录',
  'chat.merged': '已合并',
  'chat.summaryFailed': '小结生成失败，请重试',
  'chat.configureModelFirst': '请先在设置中配置模型',
  'chat.localModelNotReady': '本地模型未就绪，请到设置中下载或导入',
  'chat.greetingMorning': '早上好',
  'chat.greetingAfternoon': '下午好',
  'chat.greetingEvening': '晚上好',
  'chat.multiSelect': '多选',
  // talk
  'talk.noModelBanner': '尚未配置模型，去设置页配置 baseURL、API Key 与模型名后即可开始对话。',
  'talk.localNotReadyBanner':
    '本地模型未就绪，去设置页下载或导入模型（约 2GB）后即可开始对话，推理全程在本机完成。',
  'talk.goSettings': '去设置',
  'talk.placeholder': '想和 AI 说点什么…',
  'talk.replying': '回应中',
  'talk.scrollToBottom': '回到底部',
  'talk.saveAsRecord': '存为记录',
  'talk.replyFailed': '回应失败了',
  'talk.retryTap': '点击重试',
  'talk.retryInterrupted': '回应中断，点击重试',
  // home
  'home.tagline': '今天脑子里有什么？',
  'home.newEntry': '开始记录',
  'home.review': '历史回顾',
  // record
  'record.editTitle': '编辑记录',
  'record.updated': '已更新',
  'record.savedWithLimit': '已记录 （最多保存 10000 字）',
  // review
  'review.clearSearch': '清除搜索',
  'review.empty': '还没有记录，去写第一条吧。',
  'review.noMatch': '没有找到匹配的记录。',
  // settings
  'settings.title': '设置',
  'settings.account': '账户',
  'settings.sync': '云同步',
  'settings.aiModel': 'AI 模型',
  'settings.data': '数据管理',
  'settings.language': '语言',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  // account
  'account.signOut': '退出登录',
  'account.signingOut': '退出中…',
  'account.signOutFailed': '退出失败，请重试。',
  'account.loginRegister': '登录 / 注册',
  // sync
  'sync.description': '记录会在登录的设备间自动同步。',
  'sync.never': '尚未同步',
  'sync.syncing': '同步中…',
  'sync.lastSync': '上次同步：{time}',
  'sync.failed': '同步失败',
  // data
  'data.export': '导出备份',
  'data.exporting': '导出中…',
  'data.exportSuccess': '备份导出成功。',
  'data.exportFailed': '导出失败，请重试。',
  'data.exportEmpty': '暂无记录，可以导出空备份文件。',
  'data.exportCount': '当前共 {n} 条记录。',
  'data.import': '导入备份',
  'data.importHint': '选择之前导出的备份文件，导入将合并现有数据，较新记录不会被覆盖。',
  'data.importing': '导入中…',
  'data.importNew': '新增 {n} 条',
  'data.importUpdated': '更新 {n} 条',
  'data.importSkipped': '跳过 {n} 条',
  'data.importDone': '导入完成：{detail}。',
  'data.importDoneSimple': '导入完成。',
  'data.importFailed': '导入失败，请重试。',
  'data.importRolledBack': '导入失败，数据库已回滚，请重试。',
  'data.importDetailSep': '，',
  'data.importConfirmTitle': '确认导入备份',
  'data.importEntryCount': '记录数量',
  'data.importEntryCountValue': '{n} 条',
  'data.importTimeRange': '时间范围',
  'data.importExportTime': '导出时间',
  'data.importEmpty': '该备份不包含任何记录。',
  'data.importConfirm': '确认导入',
  // auth
  'auth.invalidCredential': '邮箱或密码不正确。',
  'auth.emailInUse': '该邮箱已注册。',
  'auth.weakPassword': '密码至少需要 6 位。',
  'auth.userNotFound': '该邮箱未注册。',
  'auth.tooManyRequests': '尝试次数过多，请稍后再试。',
  'auth.requiresRecentLogin': '出于安全考虑，请重新登录后再试。',
  'auth.expiredCode': '链接已过期，请重新申请重置密码。',
  'auth.invalidCode': '链接无效，请重新申请重置密码。',
  'auth.operationFailed': '操作失败，请稍后再试。',
  'auth.login': '登录',
  'auth.register': '注册',
  'auth.email': '邮箱',
  'auth.password': '密码',
  'auth.fillBoth': '请填写邮箱和密码。',
  'auth.fillEmail': '请填写邮箱。',
  'auth.minChars': '至少 6 位',
  'auth.resetLinkSent': '重置链接已发送，请查收邮箱。若未收到，请确认邮箱是否已注册。',
  'auth.resetHint': '输入注册邮箱，我们将发送重置密码的链接。',
  'auth.sendResetLink': '发送重置链接',
  'auth.forgotPassword': '忘记密码？',
  'auth.backToLogin': '想起密码了？回到「登录」',
  'auth.noAccount': '没有账号？切换到「注册」tab 创建一个',
  // reset
  'reset.title': '重置密码',
  'reset.newPassword': '新密码',
  'reset.confirmPassword': '确认新密码',
  'reset.mismatch': '两次输入的密码不一致。',
  'reset.update': '更新密码',
  // backup
  'backup.parseFailed': '文件格式不正确，无法解析。',
  'backup.invalidFormat': '备份文件格式不正确。',
  'backup.versionNotInteger': '备份文件格式不正确：version 必须为整数。',
  'backup.unsupportedVersion': '不支持的备份版本（当前支持版本：{v}）。',
  'backup.notMindRelax': '该文件不是 mind_relax 备份文件。',
  'backup.invalidExportTime': '备份文件格式不正确：缺少或无效的 exportTime 字段。',
  'backup.missingEntries': '备份文件格式不正确：缺少 entries 字段。',
  // model
  'model.localMode': '本地模型',
  'model.httpMode': '自定义服务器',
  'model.modeHint': '选择模型运行方式。baseURL 与模型名会跨设备同步；API Key 仅保存在本机浏览器。',
  'model.localHint':
    '在浏览器内运行 Gemma 模型：原始文字不出设备、离线可用。模型文件下载一次后保存在本机。',
  'model.statusChecking': '检测中…',
  'model.downloadProgress': '已下载 {done} MB / {total} MB（{pct}%）',
  'model.readyStatus': '已就绪 · {gb} GB · 推理全程在本机浏览器完成',
  'model.notReadyStatus': '未就绪 · 模型约 {gb} GB，下载一次后离线可用',
  'model.download': '下载模型',
  'model.downloading': '下载中…',
  'model.import': '导入模型文件',
  'model.importing': '导入中…',
  'model.imported': '模型已导入',
  'model.deleteConfirm': '确定删除本地模型吗？下次使用需重新下载。',
  'model.deleteFailed': '删除失败，请重试',
  'model.downloadFailed': '下载失败，请重试',
  'model.importFailed': '导入失败，请重试',
  'model.saveFailed': '保存失败，请重试。',
  'model.saved': '已保存',
  'model.httpHint': '配置 OpenAI 兼容的模型服务（云端 API 或你自己的服务器）。',
  'model.baseUrlPlaceholder': 'baseURL，如 https://api.openai.com/v1 或 http://localhost:11434/v1',
  'model.apiKeyPlaceholder': 'API Key',
  'model.apiKeyHint': '仅保存在本机浏览器；本地模型可填任意值。',
  'model.apiKeyMismatch': '云端配置已更新 baseURL，请确认 API Key 仍适用于该地址。',
  'model.modelPlaceholder': '模型名，如 gpt-4o-mini',
  'model.modelName': '模型名',
  'model.cloudPrivacy': '使用云端模型时，你的记录会发送给该服务商处理。',
  'model.notReady': '本地模型未就绪',
  'model.downloadHttpFailed': '下载失败：HTTP {status}',
  'model.downloadIncomplete': '下载不完整，请重试',
  'model.importSizeMismatch': '文件大小不匹配：需要 gemma-4-E2B-it-web.litertlm（约 2GB）',
  'model.downloadNetwork': '下载失败：网络错误，请检查网络后重试',
  'model.diskQuota': '存储空间不足，无法保存模型文件',
  'model.preset': '预设',
  'model.presetCustom': '自定义',
  'model.presetVertex': 'Vertex AI',
  'model.vertexRegion': 'Region',
  'model.vertexProject': '项目 ID',
  'model.vertexLocation': 'Location',
  'model.vertexHint': '自动拼接 Vertex AI 的 OpenAI 兼容端点 URL；需服务账号 API Key。',
  // date
  'date.today': '今天',
  'date.yesterday': '昨天',
};

const STORAGE_KEY = 'mind_relax_lang';

function readStored(): Lang | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'zh' || raw === 'en' ? raw : null;
  } catch {
    return null;
  }
}

/** Default English (task ① decision); a stored choice wins. */
let currentLang: Lang = readStored() ?? 'en';
const listeners = new Set<() => void>();

function applyHtmlLang(): void {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
}
applyHtmlLang();

/** Non-hook getter for call-time strings (toasts, confirm, async code). */
export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private mode — keep the in-memory choice for this session
  }
  applyHtmlLang();
  listeners.forEach((listener) => listener());
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every component that renders t() must call this so a switch re-renders it. */
export function useI18n(): Lang {
  return useSyncExternalStore(subscribeLang, getLang);
}

export type I18nKey = keyof typeof en;

export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const template = currentLang === 'zh' ? zh[key] : en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
