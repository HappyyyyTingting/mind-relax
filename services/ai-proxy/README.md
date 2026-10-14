# mind-relax AI service

A small Cloud Run service that lets the app use Gemini on Vertex AI without any
API key in the browser.

- `POST /v1/chat/completions` takes the OpenAI chat format (streaming or not),
  which the app already speaks, and answers with Gemini.
- Every request must carry a Firebase sign-in token (`Authorization: Bearer`).
- The newest user message is screened for crisis language first. On a match the
  service skips the model, returns a fixed supportive reply, and sets the
  `X-Mind-Relax-Safety: crisis` header so the app can show helplines.
- Gemini safety settings plus a safety system instruction sit behind that.
- Spending guard: at most `DAILY_REQUEST_CAP` model calls and `DAILY_BUDGET_INR`
  rupees per UTC day, across all users. Each call reserves its worst-case cost
  first and is refused if that would pass the budget; the real cost from
  Gemini's token counts then replaces the reservation. Totals are kept in
  Firestore (`ai_budget/<day>`) in the service's own project, so restarts do
  not reset them.
- Per-user rate limit, input size caps and an output token cap.

## Run locally

```bash
npm install
npm test
SKIP_AUTH=1 GOOGLE_CLOUD_PROJECT=<project> npm run dev
```

`SKIP_AUTH=1` is for local use only. Non-crisis requests call Vertex AI and are
billed to `GOOGLE_CLOUD_PROJECT`.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | — | Project that runs Vertex AI |
| `GEMINI_LOCATION` | `global` | Vertex AI location |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model id (2.5 Flash retires 2026-10-20) |
| `GEMINI_THINKING_LEVEL` | `LOW` | Thinking counts against the output cap; `default` leaves it to the model |
| `FIREBASE_PROJECT_ID` | — | Firebase project whose sign-ins are accepted |
| `ALLOWED_ORIGINS` | localhost ports | Comma-separated web origins |
| `MAX_OUTPUT_TOKENS` | `1024` | Reply length cap |
| `MAX_INPUT_CHARS` | `16000` | Request size cap |
| `REQUESTS_PER_HOUR` | `30` | Per user, per instance |
| `DAILY_REQUEST_CAP` | `200` | Model calls per UTC day, all users |
| `DAILY_BUDGET_INR` | `500` | Rupee ceiling per UTC day, all users |
| `BUDGET_STORE` | `memory` | `firestore` on Cloud Run |
| `PRICE_INPUT_USD_PER_M` / `PRICE_OUTPUT_USD_PER_M` | `1.5` / `7.5` | Post-promotion list prices (err high) |
| `INR_PER_USD` | `90` | Conversion used by the guard |
| `ASSUMED_THINKING_TOKENS` | `2000` | Worst-case thinking tokens per call |

## Deploy (Cloud Run)

```bash
gcloud run deploy mind-relax-ai \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 1 --concurrency 20 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<project>,FIREBASE_PROJECT_ID=<firebase-project>,BUDGET_STORE=firestore,ALLOWED_ORIGINS=https://<site>.web.app,https://<site>.firebaseapp.com
```

`--allow-unauthenticated` lets browsers reach the service; the Firebase token
check inside is what restricts it to signed-in users. The service account needs
the `Vertex AI User` and `Cloud Datastore User` roles, and the project needs a
Firestore database for the budget totals.
