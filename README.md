# Mind Relax

A thought-recording PWA. Write down whatever is on your mind, release the mental
load — entries are stored locally first and sync across devices.

## Features

- Record / edit / delete entries, browse them by day, search by keyword
- Merge several entries into one
- AI daily recap and an AI "thinking partner" chat
- Local-first storage (IndexedDB) with multi-device sync
- Email / password accounts, password reset
- JSON backup export and import

## Tech Stack

React + TypeScript + Vite + Dexie.js + Tailwind CSS + Firebase (Auth, Firestore,
Hosting) + vite-plugin-pwa

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build & Deploy

```bash
npm run build
firebase deploy --only hosting,firestore
```

## Notes

- The Firebase web config in `src/lib/firebase.ts` is public by design; data
  access is controlled by the Firestore security rules in `firestore.rules`.
- Sync compares `max(updatedAt, deletedAt)` per entry (last write wins); deletes
  are tombstones, never hard deletes.
