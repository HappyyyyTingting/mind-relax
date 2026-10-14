# Mind Relax

A thought-recording PWA. Write down whatever is on your mind, release the mental
load — entries are stored locally first and sync across devices.

## Features

- Record / edit / delete entries, browse them by day, search by keyword
- Merge several entries into one
- AI daily recap and an AI "thinking partner" chat, powered by Google Gemini
  (default) or on-device Gemma
- Crisis safety: a helpline card and a fixed safe reply when a message
  mentions suicide or self-harm
- Local-first storage (IndexedDB) with multi-device sync
- Email / password accounts, password reset
- JSON backup export and import

## Built during the Google Cloud AI Builder Cup 2026

Mind Relax started as a plain journaling prototype that Tingting built before
the event (writing and merging entries, email accounts, multi-device sync).
It had no AI. Everything AI in this app was built during the official build
window, which opened on 7 September 2026. Before the event, the code lived in
an earlier private repository; we are happy to share its full history on
request.

**Before the event (prototype, no AI):**
- Recording, editing, merging and searching entries; the "today" view
- Email / password accounts and password reset
- Multi-device sync (then on Supabase)

**During the event (from 7 Sep 2026):**
- AI replies to entries, streamed as they are written (10 Sep)
- AI daily recap (10 Sep)
- "Talk with AI" thinking-partner conversation (16 Sep)
- Context handling: today's entries as background, trimming and rolling
  summaries for long chats (21 Sep)
- Chat experience: smart scroll, timestamps, drafts, retry, delete (21 Sep)
- Redesigned thinking-partner prompt (30 Sep)
- On-device Gemma running fully in the browser, for privacy (12 Oct)
- Move to Firebase (Auth, Firestore, Hosting) and English / Chinese UI (12 Oct)
- Opt-in sync per device and per-account data separation (13 Oct)
- **Google Gemini on Cloud Run** as the default AI, so nobody needs an API key
  or a 2 GB download (`services/ai-proxy`, 14 Oct)
- **Safety layer:** crisis phrase check in English and Chinese, a fixed safe
  reply instead of a model answer, and a helpline card in the app (14 Oct)
- **Cost guard:** sign-in required, per-user hourly limit, and a daily cap on
  calls and spend kept in Firestore (14 Oct)
- English prompts that follow the app language (14 Oct)

## Tech Stack

React + TypeScript + Vite + Dexie.js + Tailwind CSS + Firebase (Auth, Firestore,
Hosting) + vite-plugin-pwa. AI: Gemini on Vertex AI via a Cloud Run service
(`services/ai-proxy`, see its README), or Gemma 4 in the browser via LiteRT-LM.

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
