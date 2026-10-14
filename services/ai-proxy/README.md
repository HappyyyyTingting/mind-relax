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
- Per-user rate limit, input size caps and an output token cap bound the cost.

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
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model id |
| `GEMINI_THINKING_BUDGET` | unset | Sent only when set |
| `FIREBASE_PROJECT_ID` | — | Firebase project whose sign-ins are accepted |
| `ALLOWED_ORIGINS` | localhost ports | Comma-separated web origins |
| `MAX_OUTPUT_TOKENS` | `1024` | Reply length cap |
| `MAX_INPUT_CHARS` | `40000` | Request size cap |
| `REQUESTS_PER_HOUR` | `60` | Per user, per instance |

## Deploy (Cloud Run)

```bash
gcloud run deploy mind-relax-ai \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<project>,FIREBASE_PROJECT_ID=<firebase-project>,ALLOWED_ORIGINS=https://<site>.web.app,https://<site>.firebaseapp.com
```

`--allow-unauthenticated` lets browsers reach the service; the Firebase token
check inside is what restricts it to signed-in users. The service account needs
the `Vertex AI User` role.
