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
| `PHOTO_BUCKET` | — | Private Cloud Storage bucket for journal photos; empty = photos not kept |
| `PULSE_DATASET` | — | BigQuery dataset for the community pulse; empty = pulse routes off |
| `PULSE_SECRET` | — | 32+ random characters for the daily contributor hash; required with `PULSE_DATASET`; never commit it |

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

## Community pulse (BigQuery)

Opt-in and anonymous. The app sends one number per day (that day's average
mood, 1 to 5). BigQuery stores the day, the number and a contributor key that
is `HMAC(PULSE_SECRET, uid + day)`, so the same person has a different key
every day. No text, feelings or user ids are stored, and the pulse log lines
leave out the uid.

- `POST /v1/pulse` saves or replaces the caller's numbers for the last 7 days.
- `DELETE /v1/pulse` (sharing turned off) deletes the caller's last 90 days.
- `GET /v1/pulse` returns the last 14 days, only days with 10+ people, plus a
  7-day BigQuery ML (`ARIMA_PLUS`) forecast. Cached for 10 minutes.

One-time setup (dataset in `asia-southeast1`, table `checkins` partitioned by
`day`, the service account as dataset `WRITER` plus project
`roles/bigquery.jobUser`), then:

```bash
# Demo only: 60 days of rows marked source = 'sample' (the app labels them).
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> --dataset_id=mind_relax_pulse < bigquery/sample-data.sql
# Train or refresh the forecast.
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> --dataset_id=mind_relax_pulse < bigquery/train-forecast.sql
```

At this size everything stays inside BigQuery's free monthly tier.
