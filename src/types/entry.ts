export interface Entry {
  id: string;
  type: 'thought';
  content: string;
  createdAt: number;
  updatedAt: number;
  /** 软删除标记：设置后该记录视为已删除，用于同步传播删除操作。 */
  deletedAt?: number;
  metadata?: {
    moodScore?: number;
    anxietyLevel?: number;
  };
}
