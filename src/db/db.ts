import Dexie, { type Table } from 'dexie';
import type { Entry } from '../types/entry';
import type { Conversation } from '../types/talk';

/** A journal photo kept on this device (cloud sync off). */
export interface LocalPhoto {
  id: string;
  blob: Blob;
}

class MindRelaxDatabase extends Dexie {
  entries!: Table<Entry, string>;
  conversations!: Table<Conversation, string>;
  photos!: Table<LocalPhoto, string>;

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

    // v4 adds the per-account owner index; existing rows keep their data and
    // start out unowned (see entryRepository's one-time claim).
    this.version(4).stores({
      entries: 'id, createdAt, updatedAt, type, owner',
      conversations: 'date',
    });

    // v5 keeps journal photos on the device when cloud sync is off.
    this.version(5).stores({
      entries: 'id, createdAt, updatedAt, type, owner',
      conversations: 'date',
      photos: 'id',
    });
  }
}

export const db = new MindRelaxDatabase();
