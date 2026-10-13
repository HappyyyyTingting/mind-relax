export interface Entry {
  id: string;
  type: 'thought';
  content: string;
  createdAt: number;
  updatedAt: number;
  /**
   * The account this entry belongs to, set when it is written locally. It is
   * a local detail and never reaches the cloud (entryToRow maps fields
   * explicitly), so signing in as someone else cannot show — or upload — the
   * previous account's entries.
   */
  owner?: string;
  /** 软删除标记：设置后该记录视为已删除，用于同步传播删除操作。 */
  deletedAt?: number;
  metadata?: {
    moodScore?: number;
    anxietyLevel?: number;
  };
}
