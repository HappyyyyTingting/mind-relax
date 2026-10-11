import type { Entry } from './entry';

export interface BackupFile {
  version: 1;
  app: 'mind_relax';
  exportTime: string;
  summary: {
    entryCount: number;
    earliestCreatedAt: string;
    latestCreatedAt: string;
  };
  entries: Entry[];
}

export interface ImportResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
}
