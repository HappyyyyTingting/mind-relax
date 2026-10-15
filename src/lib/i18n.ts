import { useSyncExternalStore } from 'react';
import { hi } from './locales/hi';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { ms } from './locales/ms';

/**
 * Minimal i18n: a flat string dictionary for the static UI (016-2, task ①).
 * AI prompts are not in this dictionary: aiClient.ts keeps one Chinese prompt
 * body per task and decides the reply's language per request (so a reply
 * follows what the user wrote, not the interface). The interface language is
 * still what picks the scaffolding strings around the user's own text — the
 * headings framing the entries and the summaries. `en` is the source of truth
 * for keys; `zh` is compile-checked against it so a missing translation fails
 * the build. Hindi, Malay, Japanese and Korean live in ./locales and are
 * checked the same way.
 */

export type Lang = 'en' | 'zh' | 'hi' | 'ms' | 'ja' | 'ko';

/**
 * Languages offered in Settings, each named in its own language so someone
 * can find theirs whatever the app is showing. `locale` drives dates and the
 * <html lang> attribute.
 */
export const LANGUAGES: { code: Lang; name: string; locale: string }[] = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
  { code: 'hi', name: 'हिन्दी', locale: 'hi-IN' },
  { code: 'ms', name: 'Bahasa Melayu', locale: 'ms-MY' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'ko', name: '한국어', locale: 'ko-KR' },
];

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((option) => option.code === value);
}

/** BCP 47 locale for Intl formatters. */
export function localeOf(lang: Lang): string {
  return LANGUAGES.find((option) => option.code === lang)?.locale ?? 'en-US';
}

const en = {
  // common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.copy': 'Copy',
  'common.retry': 'Retry',
  'common.settings': 'Settings',
  'common.back': 'Back',
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
  'chat.talkEntry': 'Talk with AI',
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
  // record
  'record.editTitle': 'Edit entry',
  'record.updated': 'Updated',
  'record.savedWithLimit': 'Saved (up to 10,000 characters)',
  // review
  'review.clearSearch': 'Clear search',
  'review.empty': 'No entries yet. Write your first one!',
  'review.noMatch': 'No matching entries.',
  'review.entriesTitle': 'Entries',
  // review — weekly review
  'review.weeklyTitle': 'Weekly review',
  'review.weeklyStart': 'Generate weekly review',
  'review.weeklyGenerating': 'Reviewing…',
  'review.weeklyNotEnough': 'Not enough entries yet.',
  'review.weeklyFailed': "Couldn't finish the weekly review. Please try again.",
  'review.tagWeekly': 'Weekly review',
  // settings
  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.sync': 'Cloud sync',
  'settings.aiModel': 'AI model',
  'settings.data': 'Data management',
  'settings.language': 'Language',
  // account
  'account.signOut': 'Sign out',
  'account.signingOut': 'Signing out…',
  'account.signOutFailed': 'Sign out failed. Please try again.',
  'account.loginRegister': 'Log in / Sign up',
  // sync
  'sync.description': 'Your entries sync automatically across signed-in devices.',
  'sync.toggleLabel': 'Cloud sync',
  'sync.off': 'Off',
  'sync.on': 'On',
  'sync.offHint':
    'Off by default. Your entries stay in this browser and nothing is sent to the cloud. Turn it on to reach them from your other devices.',
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
  'auth.invalidEmail': 'That email address is not valid.',
  'auth.networkFailed': 'Could not reach the server. Check your connection.',
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
  'model.geminiMode': 'Google Gemini',
  'model.geminiTag': 'Default',
  'model.geminiHint':
    'Replies come from Google Gemini through our server, using your sign-in. Nothing to set up. Your entries for today and this conversation are sent to Google Cloud to write the reply and are not stored there. There is a daily limit to keep the service free.',
  'model.localMode': 'On-device',
  'model.privacyTag': 'Private',
  'model.cloudMode': 'Custom API',
  'model.modeHint': 'Choose how the model runs.',
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
  'model.httpHint':
    'Vertex AI endpoint format: https://{region}-aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/endpoints/openapi (requires a service account API key)',
  'model.baseUrlPlaceholder': 'e.g. https://api.openai.com/v1 or http://localhost:11434/v1',
  'model.apiKeyPlaceholder': 'API Key',
  'model.apiKeyHint':
    'The API key stays in this browser only; the baseURL and model name sync across devices.',
  'model.apiKeyMismatch':
    'The cloud config updated the baseURL — make sure the API key still works with it.',
  'model.modelPlaceholder': 'e.g. gpt-4o-mini',
  'model.modelName': 'Model name',
  'model.cloudPrivacy': 'With a cloud model, your entries are sent to that provider for processing.',
  'model.notReady': 'Local model not ready',
  'model.downloadHttpFailed': 'Download failed: HTTP {status}',
  'model.downloadIncomplete': 'Download incomplete. Please try again.',
  'model.importSizeMismatch': 'File size mismatch: gemma-4-E2B-it-web.litertlm (about 2 GB) is required',
  'model.downloadNetwork': 'Download failed: network error. Check your connection and try again.',
  'model.diskQuota': 'Not enough storage space to save the model file',
  // crisis
  'crisis.title': 'You deserve support right now',
  'crisis.body':
    "If you're thinking about hurting yourself, please reach out now. These lines are free, confidential and open 24 hours. If you're in immediate danger, call your local emergency number.",
  'crisis.otherRegions': 'Somewhere else? Find a line near you at',
  'crisis.hide': 'Hide',
  // ui polish
  'ui.todayNone': 'Nothing written yet today',
  'ui.todayCount': 'Today: {n} entries · last at {time}',
  'ui.todayOne': 'Today: 1 entry · at {time}',
  'ui.talkItThrough': 'Talk it through',
  'ui.searchPlaceholder': 'Search your entries',
  'ui.aiRecap': 'AI recap',
  'ui.wakingUp': 'Waking up the AI… this can take a few seconds.',
  'ui.typing': 'AI is typing',
  'ui.needHelp': 'Need help now?',
  'ui.modeGemini': 'Gemini',
  'ui.modeLocal': 'On-device',
  'ui.modeHttp': 'Custom API',
  'ui.privateChip': 'Private',
  'ui.welcomeTitle': 'Welcome to Mind Relax',
  'ui.welcomeWrite': 'Write: put down whatever is on your mind, a line is enough.',
  'ui.welcomeTalk': 'Talk: the AI reads today\'s entries and helps you think it through.',
  'ui.welcomeRecap': 'Recap: at the end of the day, get a calm summary of your threads and mood.',
  'ui.welcomePrivacy': 'Entries stay on this device unless you turn on cloud sync. With Gemini, what you share (today\'s entries, a voice clip, a photo) is used only for that reply. Photos you add are kept in your own private folder.',
  'ui.welcomeDismiss': 'Got it',
  'ui.voiceStart': 'Speak your entry',
  'ui.voiceStop': 'Stop recording',
  'ui.voiceListening': 'Listening… {time}',
  'ui.voiceTranscribing': 'Turning your voice into text…',
  'ui.voiceFailed': "Couldn't turn that into text. Please try again.",
  'ui.voiceEmpty': 'No speech heard. Try again a little closer to the mic.',
  'ui.voiceDenied': 'Microphone is blocked. Allow it in your browser settings.',
  'ui.photoAdd': 'Add a photo or a diary page',
  'ui.photoReading': 'Reading your photo…',
  'ui.photoFailed': "Couldn't read that photo. Please try another one.",
  'ui.photoRemove': 'Remove photo',
  // insights
  'chat.insights': 'Insights',
  'insights.title': 'Mood insights',
  'insights.week': '7 days',
  'insights.month': '30 days',
  'insights.average': 'Average mood',
  'insights.entriesCount': 'from {n} entries',
  'insights.level1': 'Very low',
  'insights.level2': 'Low',
  'insights.level3': 'Okay',
  'insights.level4': 'Good',
  'insights.level5': 'Very good',
  'insights.chartLabel': 'Daily average mood, from 1 (very low) to 5 (very good)',
  'insights.feelings': 'Feelings that came up most',
  'insights.empty': 'No moods yet. Write a few entries, then come back here.',
  'insights.reading': 'Reading the mood of {n} entries…',
  'insights.readMore': 'Read {n} more entries',
  'insights.failed': 'Couldn\'t read moods right now. Please try again later.',
  'insights.needsGemini': 'Mood reading uses Google Gemini. Choose it in AI model settings to fill this chart.',
  'insights.privacy': 'Gemini reads your entries only to give each one a mood score. Just the score and one feeling word are saved, with the entry.',
  'pulse.title': 'Community pulse',
  'pulse.about': 'Anonymous daily mood averages from people who chose to share. A day appears only once at least {n} people shared it.',
  'pulse.share': 'Share my daily mood number',
  'pulse.shareHint': 'Only one number per day (1–5) is sent. No words, no feelings, no account id. Turning this off deletes what you shared.',
  'pulse.removed': 'Sharing is off. Your shared numbers were deleted.',
  'pulse.shareFailed': 'Couldn\'t change sharing right now. Please try again.',
  'pulse.notEnough': 'Not enough people have shared yet. A day appears once {n} people share it.',
  'pulse.latest': 'Latest day: {avg} / 5 from {n} people',
  'pulse.forecast': 'Dashed line: the next 7 days, forecast by BigQuery ML.',
  'pulse.sample': 'Sample data for the demo',
  'pulse.loadFailed': 'Couldn\'t load the community pulse right now.',
  'pulse.chartLabel': 'Community mood over the last two weeks, with a 7-day forecast',
  'pulse.loading': 'Loading the community pulse…',
  'feeling.happy': 'Happy',
  'feeling.calm': 'Calm',
  'feeling.grateful': 'Grateful',
  'feeling.hopeful': 'Hopeful',
  'feeling.tired': 'Tired',
  'feeling.anxious': 'Anxious',
  'feeling.sad': 'Sad',
  'feeling.angry': 'Angry',
  'feeling.lonely': 'Lonely',
  'feeling.mixed': 'Mixed',
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
  'common.back': '返回',
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
  'chat.summary': '今日小结',
  'chat.summarizing': '生成中…',
  'chat.review': '回看',
  'chat.talkEntry': '和 AI 聊聊',
  'chat.merge': '合并',
  'chat.mergeCount': '合并（{n}）',
  'chat.mergeConfirm': '将合并 {n} 条为一条记录',
  'chat.merged': '已合并',
  'chat.summaryFailed': '今日小结生成失败，请重试',
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
  // record
  'record.editTitle': '编辑记录',
  'record.updated': '已更新',
  'record.savedWithLimit': '已记录 （最多保存 10000 字）',
  // review
  'review.clearSearch': '清除搜索',
  'review.empty': '还没有记录，去写第一条吧。',
  'review.noMatch': '没有找到匹配的记录。',
  'review.entriesTitle': '记录',
  // review — weekly review
  'review.weeklyTitle': '周览',
  'review.weeklyStart': '生成周览',
  'review.weeklyGenerating': '生成中…',
  'review.weeklyNotEnough': '记录还太少',
  'review.weeklyFailed': '周览生成失败，请重试',
  'review.tagWeekly': '周览',
  // settings
  'settings.title': '设置',
  'settings.account': '账户',
  'settings.sync': '云同步',
  'settings.aiModel': 'AI 模型',
  'settings.data': '数据管理',
  'settings.language': '语言',
  // account
  'account.signOut': '退出登录',
  'account.signingOut': '退出中…',
  'account.signOutFailed': '退出失败，请重试。',
  'account.loginRegister': '登录 / 注册',
  // sync
  'sync.description': '记录会在登录的设备间自动同步。',
  'sync.toggleLabel': '云同步',
  'sync.off': '关闭',
  'sync.on': '开启',
  'sync.offHint':
    '默认关闭。记录只保存在这台设备的浏览器里，不会上传云端。开启后可在其它设备上看到。',
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
  'auth.invalidEmail': '邮箱格式不正确，请检查后重试。',
  'auth.networkFailed': '无法连接服务器，请检查网络。',
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
  'model.geminiMode': 'Google Gemini',
  'model.geminiTag': '默认',
  'model.geminiHint':
    '回复由 Google Gemini 通过我们的服务器生成，使用你的登录身份，无需任何设置。今天的记录和本次对话会发送到 Google Cloud 用于生成回复，不会在那里保存。为保持免费，每天有使用上限。',
  'model.localMode': '本地模型',
  'model.privacyTag': '隐私',
  'model.cloudMode': '自定义 API',
  'model.modeHint': '选择模型运行方式。',
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
  'model.httpHint':
    'Vertex AI 端点格式：https://{region}-aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/endpoints/openapi（需服务账号 API Key）',
  'model.baseUrlPlaceholder': '如 https://api.openai.com/v1 或 http://localhost:11434/v1',
  'model.apiKeyPlaceholder': 'API Key',
  'model.apiKeyHint': 'API Key 仅保存在本机浏览器；baseURL 与模型名会跨设备同步。',
  'model.apiKeyMismatch': '云端配置已更新 baseURL，请确认 API Key 仍适用于该地址。',
  'model.modelPlaceholder': '如 gpt-4o-mini',
  'model.modelName': '模型名',
  'model.cloudPrivacy': '使用云端模型时，你的记录会发送给该服务商处理。',
  'model.notReady': '本地模型未就绪',
  'model.downloadHttpFailed': '下载失败：HTTP {status}',
  'model.downloadIncomplete': '下载不完整，请重试',
  'model.importSizeMismatch': '文件大小不匹配：需要 gemma-4-E2B-it-web.litertlm（约 2GB）',
  'model.downloadNetwork': '下载失败：网络错误，请检查网络后重试',
  'model.diskQuota': '存储空间不足，无法保存模型文件',
  // crisis
  'crisis.title': '此刻，你值得被支持',
  'crisis.body':
    '如果你有伤害自己的想法，请现在就联系求助。以下热线免费、保密、24 小时开放。如有紧急危险，请立即拨打当地急救电话。',
  'crisis.otherRegions': '在其他地区？可在这里查找附近的热线：',
  'crisis.hide': '收起',
  // ui polish
  'ui.todayNone': '今天还没有记录',
  'ui.todayCount': '今天：{n} 条记录 · 最近 {time}',
  'ui.todayOne': '今天：1 条记录 · {time}',
  'ui.talkItThrough': '和 AI 聊聊今天',
  'ui.searchPlaceholder': '搜索你的记录',
  'ui.aiRecap': 'AI 小结',
  'ui.wakingUp': '正在唤醒 AI… 可能需要几秒钟。',
  'ui.typing': 'AI 正在输入',
  'ui.needHelp': '需要帮助？',
  'ui.modeGemini': 'Gemini',
  'ui.modeLocal': '本地模型',
  'ui.modeHttp': '自定义 API',
  'ui.privateChip': '私密',
  'ui.welcomeTitle': '欢迎来到 Mind Relax',
  'ui.welcomeWrite': '记录：写下脑子里的任何想法，一句话就够。',
  'ui.welcomeTalk': '聊聊：AI 会读今天的记录，陪你把事情想清楚。',
  'ui.welcomeRecap': '小结：一天结束时，得到一份关于主线和情绪的平静小结。',
  'ui.welcomePrivacy': '除非你开启云同步，记录只保存在这台设备上。使用 Gemini 时，你分享的内容（今天的记录、语音、照片）只用于这一次回复。你添加的照片保存在你自己的私人文件夹里。',
  'ui.welcomeDismiss': '知道了',
  'ui.voiceStart': '用语音记录',
  'ui.voiceStop': '停止录音',
  'ui.voiceListening': '正在聆听… {time}',
  'ui.voiceTranscribing': '正在把语音转成文字…',
  'ui.voiceFailed': '没能转成文字，请再试一次。',
  'ui.voiceEmpty': '没有听到说话声，请靠近麦克风再试一次。',
  'ui.voiceDenied': '麦克风权限被关闭，请在浏览器设置中允许。',
  'ui.photoAdd': '添加照片或手写日记',
  'ui.photoReading': '正在读取照片…',
  'ui.photoFailed': '没能读取这张照片，请换一张试试。',
  'ui.photoRemove': '移除照片',
  // insights
  'chat.insights': '洞察',
  'insights.title': '情绪洞察',
  'insights.week': '7 天',
  'insights.month': '30 天',
  'insights.average': '平均情绪',
  'insights.entriesCount': '基于 {n} 条记录',
  'insights.level1': '很低落',
  'insights.level2': '低落',
  'insights.level3': '一般',
  'insights.level4': '不错',
  'insights.level5': '很好',
  'insights.chartLabel': '每日平均情绪，从 1（很低落）到 5（很好）',
  'insights.feelings': '最常出现的感受',
  'insights.empty': '还没有情绪数据。写几条记录后再回来看看。',
  'insights.reading': '正在读取 {n} 条记录的情绪…',
  'insights.readMore': '再读取 {n} 条记录',
  'insights.failed': '暂时无法读取情绪，请稍后再试。',
  'insights.needsGemini': '情绪读取使用 Google Gemini。在 AI 模型设置中选择它即可生成图表。',
  'insights.privacy': 'Gemini 只为给每条记录打一个情绪分而读取内容。只有分数和一个感受词会随记录保存。',
  'pulse.title': '社区情绪脉搏',
  'pulse.about': '来自自愿分享者的匿名每日情绪平均值。某一天至少有 {n} 人分享后才会显示。',
  'pulse.share': '分享我每天的情绪分数',
  'pulse.shareHint': '每天只发送一个数字（1–5）。不含文字、感受词或账号 ID。关闭后会删除你分享过的数据。',
  'pulse.removed': '已关闭分享，你分享过的数字已删除。',
  'pulse.shareFailed': '暂时无法更改分享设置，请稍后再试。',
  'pulse.notEnough': '分享的人还不够。某一天有 {n} 人分享后才会显示。',
  'pulse.latest': '最近一天：{avg} / 5，来自 {n} 人',
  'pulse.forecast': '虚线：由 BigQuery ML 预测的未来 7 天。',
  'pulse.sample': '演示用示例数据',
  'pulse.loadFailed': '暂时无法加载社区情绪脉搏。',
  'pulse.chartLabel': '过去两周的社区情绪，以及未来 7 天的预测',
  'pulse.loading': '正在加载社区情绪脉搏…',
  'feeling.happy': '开心',
  'feeling.calm': '平静',
  'feeling.grateful': '感恩',
  'feeling.hopeful': '有希望',
  'feeling.tired': '疲惫',
  'feeling.anxious': '焦虑',
  'feeling.sad': '难过',
  'feeling.angry': '生气',
  'feeling.lonely': '孤独',
  'feeling.mixed': '复杂',
  // date
  'date.today': '今天',
  'date.yesterday': '昨天',
};

const STORAGE_KEY = 'mind_relax_lang';

function readStored(): Lang | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLang(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Default English (task ① decision); a stored choice wins. */
let currentLang: Lang = readStored() ?? 'en';
const listeners = new Set<() => void>();

function applyHtmlLang(): void {
  document.documentElement.lang = localeOf(currentLang);
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

const dictionaries: Record<Lang, Record<I18nKey, string>> = { en, zh, hi, ms, ja, ko };

export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[currentLang][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
