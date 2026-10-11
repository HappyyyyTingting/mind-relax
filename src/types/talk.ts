export type TalkMessageStatus = 'streaming' | 'done' | 'failed' | 'partial';

export interface TalkMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: TalkMessageStatus;
  createdAt: number;
  /** 合并版本号：任何修改（含流式 delta）都会更新；跨设备按 max(updatedAt, deletedAt) 取新。 */
  updatedAt: number;
  /** Set when the message is saved as a record; excluded from later contexts. */
  savedAt?: number;
  /** 墓碑：设置后视为已删除（不展示），用于跨设备传播删除。 */
  deletedAt?: number;
}

/** One day of talk messages; the date string ('YYYY-MM-DD') is the primary key. */
export interface Conversation {
  date: string;
  messages: TalkMessage[];
  /** 对话所属账号（013 起记录，用于账号隔离；旧数据可能为空）。 */
  userId?: string | null;
  /** 早前对话的滚动摘要（014 起；仅本机，随当天清空，不参与云同步）。 */
  summary?: string;
}
