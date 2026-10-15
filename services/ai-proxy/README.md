# mind-relax AI service

A small Cloud Run service that lets the app use Gemini on Vertex AI without any
API key in the browser.

- `POST /v1/chat/completions` takes the OpenAI chat format (streaming or not),
  which the app already speaks, and answers with Gemini.
- Every request must carry a Firebase sign-in token (`Authorization: Bearer`).
- The newest user message is screened for crisis language first. On a match the
  service skips the model, returns a fixed supportive reply, and sets the
  `X-Mind-Relax-Safety: crisis` header so the app can show helplines.
- Messages the phrase list lets through go to a second layer: Gemini labels
  them `none`, `concern` or `crisis` (see "Safety layers" below). `crisis`
  gets the same fixed reply; `concern` asks the reply to check in first.
- Gemini safety settings plus a safety system instruction sit behind that.
- Spending guard: at most `DAILY_REQUEST_CAP` model calls and `DAILY_BUDGET_INR`
  rupees per UTC day, across all users. Each call reserves its worst-case cost
  first and is refused if that would pass the budget; the real cost from
  Gemini's token counts then replaces the reservation. Totals are kept in
  Firestore (`ai_budget/<day>`) in the service's own project, so restarts do
  not reset them.
- Per-user rate limit, input size caps and an output token cap.
- `POST /v1/coach` is the weekly coach: a Gemini agent with function calling
  (see "Weekly coach" below).

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
| `SAFETY_CLASSIFIER` | on | `0` turns the Gemini safety classifier off (phrase list only) |
| `PHOTO_BUCKET` | — | Private Cloud Storage bucket for journal photos; empty = photos not kept |
| `PULSE_DATASET` | — | BigQuery dataset for the community pulse; empty = pulse routes off |
| `PULSE_SECRET` | — | 32+ random characters for the daily contributor hash; required with `PULSE_DATASET`; never commit it |
| `EVENTS_TOPIC` | — | Pub/Sub topic for anonymous safety events; empty = not published |
| `JOB_INVOKER` | — | Service account email Cloud Scheduler signs as; empty = jobs off |
| `JOB_AUDIENCE` | — | This service's URL, the audience of the scheduler's token |

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

## Safety layers

1. **Phrase list** (`src/safety.ts`): free, instant, the same every time. It
   catches direct words in six languages, but not things said sideways.
2. **Gemini classifier** (`src/riskCheck.ts`): runs only when the phrase list
   passes a message. It reads the newest three user messages and returns one
   label. It never writes to the user. If Gemini blocks the text itself, that
   counts as `crisis`. If the classifier cannot run, the message goes on as
   before (fail open, the other layers still apply). Its cost counts against
   the rupee cap but not the daily call count.
3. **Gemini safety settings and the safety instruction** in every reply.

Eval set: `eval/safety-cases.json`, 72 messages, 12 per language (3 direct,
5 indirect, 4 everyday figures of speech). Results are in `eval/RESULTS.md`.

```bash
npm run eval:safety              # phrase list only, free
GOOGLE_CLOUD_PROJECT=<project> npm run eval:safety -- --live   # + Gemini, under ₹5
```

| | Caught (48 crisis) | Indirect caught (30) | False alarms (24 everyday) |
|---|---|---|---|
| Phrase list only | 18 (38%) | 0 | 2 |
| Phrase list + Gemini | 48 (100%) | 30 | 2 |

Both remaining false alarms come from the phrase list (it leans broad on
purpose: a false alarm shows a gentle reply and helplines, a miss is worse).

## Weekly coach

`POST /v1/coach` answers a follow-up question about the weekly review. The app
sends the review's own days (picked by the same code that picked the review's
days), the review text and the question. Nothing is stored.

Gemini answers with function calling, in up to 4 rounds:

| Tool | Returns |
|---|---|
| `list_days` | Each day's date, mood (1 to 5) and feeling words |
| `read_day` | One day's own words |
| `community_pulse` | The anonymous community (or group) average on those days, 10+ people only |

The last round forbids tools, so it always ends with an answer. The reply
lists the tools used, and the app shows them under the answer ("Looked at:
...") so the user can see what it based the answer on. Both safety layers
screen the question first. One question counts as one call against the daily
call cap; every round counts against the rupee cap.

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

**Groups.** A campus or company shares a join code (6 to 24 letters, digits
or dashes). A member's `POST` also sends the code; the row stores
`grp = sha256("mind-relax-group|" + code)` (first 32 hex characters), never
the code. `GET /v1/pulse` with an `X-Pulse-Group: CODE` header (kept out of the URL so
the code never lands in request logs) returns that group's own average under the
same 10-person rule, with no forecast. A member's rows still count for
everyone.

One-time setup (dataset in `asia-southeast1`, table `checkins` partitioned by
`day`, the service account as dataset `WRITER` plus project
`roles/bigquery.jobUser`), then:

```bash
# Demo only: 60 days of rows marked source = 'sample' (the app labels them).
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> --dataset_id=mind_relax_pulse < bigquery/sample-data.sql
# Groups: add the grp column (once, before deploying a server that writes it).
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> < bigquery/add-groups.sql
# Demo only: 14 days of sample rows for the group code DEMO-CAMPUS.
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> < bigquery/sample-group.sql
# Train or refresh the forecast.
bq query --use_legacy_sql=false --location=asia-southeast1 --project_id=<project> --dataset_id=mind_relax_pulse < bigquery/train-forecast.sql
```

At this size everything stays inside BigQuery's free monthly tier.

## Safety counts and scheduled jobs (Pub/Sub, Cloud Scheduler)

When a chat message gets the crisis reply, the server publishes
`{ "event": "crisis", "lang": "hi", "day": "2026-10-15" }` to the
`mind-relax-events` topic. That is the whole message: no user id, no text.
A BigQuery subscription (`mind-relax-events-to-bq`, "use table schema")
writes it straight into `mind_relax_pulse.safety_events`, so no extra service
runs. Publishing never delays the reply.

Cloud Scheduler calls `POST /v1/internal/jobs/<name>` with an OIDC token for
`JOB_INVOKER`; any other caller gets 401.

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `mind-relax-retrain` → `retrain` | daily 00:30 | Retrains the BigQuery ML forecast on the newest days |
| `mind-relax-weekly-digest` → `digest` | Mondays 01:00 | Adds last week's crisis counts by language and pulse totals to `weekly_digest` |

Run one by hand: `gcloud scheduler jobs run mind-relax-retrain --location asia-southeast1`.
Cloud Scheduler gives 3 free jobs per account; Pub/Sub and BigQuery stay in
their free tiers at this size.
