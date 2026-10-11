import Dexie, { type Table } from 'dexie';
import type { Entry } from '../types/entry';
import type { Conversation } from '../types/talk';

class MindRelaxDatabase extends Dexie {
  entries!: Table<Entry, string>;
  conversations!: Table<Conversation, string>;

  constructor() {
    super('mindRelax');

    this.version(1).stores({
      entries: 'id, createdAt, updatedAt, type',
    });

    this.version(2).stores({
      entries: 'id, createdAt, updatedAt, type',
    });

    this.version(3).stores({
      entries: 'id, createdAt, updatedAt, type',
      conversations: 'date',
    });
  }
}

export const db = new MindRelaxDatabase();
