# KB Maker

Transform documents into structured, industry-standard Markdown knowledge bases for FAQ chatbots — powered by Google Vertex AI.

## What It Does

KB Maker ingests a PDF or image file, extracts its content, and generates:

1. **Structured Markdown KB** — formatted to FAQ chatbot industry standards with tagged FAQ entries, glossary, and metadata
2. **System instructions** — updated chatbot system prompt incorporating the KB's scope
3. **Quality-check report** — automated scoring against best-practice criteria (structure, tagging, chatbot readiness, completeness)
4. **GitHub push** — one-click commit to your repository after review and approval

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| AI Backend | Google Cloud Vertex AI (`@google-cloud/vertexai`) — default: Gemini 1.5 Pro / Gemma (configurable via `VERTEX_MODEL`) |
| File Parsing | `pdf-parse` (PDFs), `tesseract.js` (image OCR) |
| GitHub | `@octokit/rest` |
| Auth (GCP) | Application Default Credentials (ADC) — **no API keys** |
| Auth (GitHub) | Personal Access Token or GitHub App |

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Google Cloud SDK** (`gcloud`) — for local development
- A **GCP project** with the Vertex AI API enabled
- A **GitHub** repo to push generated KBs to

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd kb_maker
npm install --legacy-peer-deps
```

### 2. Configure Google Cloud credentials (ADC)

KB Maker uses **Application Default Credentials** — no API key is ever needed.

```bash
# Install gcloud if you haven't
# https://cloud.google.com/sdk/docs/install

# Log in and set application-default credentials
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

This creates a credentials file at `~/.config/gcloud/application_default_credentials.json` that the Vertex AI SDK picks up automatically.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1

GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=your-kb-repo
GITHUB_TARGET_BRANCH=kb-updates
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Credential Strategy by Environment

| Environment | How ADC is resolved |
|---|---|
| **Local dev** | `gcloud auth application-default login` — credentials stored at `~/.config/gcloud/application_default_credentials.json` |
| **CI/CD** | `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to a service account JSON file |
| **GKE** | Workload Identity — the pod's Kubernetes service account is mapped to a GCP service account |
| **Cloud Run** | Service account attached to the Cloud Run service — ADC resolves automatically |

> **Never commit API keys, service account JSONs, or GitHub tokens to version control.**

---

## Service Account Setup for CI/CD

### Using Workload Identity Federation (recommended)

1. Create a service account:
   ```bash
   gcloud iam service-accounts create kb-maker-sa \
     --display-name="KB Maker Service Account"
   ```

2. Grant Vertex AI permissions:
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:kb-maker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

3. Configure Workload Identity Federation for your CI provider (GitHub Actions, GitLab CI, etc.):
   ```bash
   # Create a workload identity pool
   gcloud iam workload-identity-pools create github-pool \
     --location="global" \
     --display-name="GitHub Pool"

   # Create a provider for GitHub Actions
   gcloud iam workload-identity-pools providers create-oidc github-provider \
     --location="global" \
     --workload-identity-pool="github-pool" \
     --display-name="GitHub Provider" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"

   # Allow the GitHub repo to impersonate the service account
   gcloud iam service-accounts add-iam-policy-binding \
     kb-maker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_ORG/YOUR_REPO"
   ```

### Using a service account key (simpler, less secure)

```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=kb-maker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com

# In CI, set:
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

---

## GitHub App Setup

For production, a GitHub App is preferred over a PAT:

1. **Create a GitHub App** at `https://github.com/settings/apps/new`
   - Name: `KB Maker`
   - Permissions: `Contents` (read/write), `Pull requests` (read/write)
   - Subscribe to no webhook events
   - Generate a private key (PEM file)

2. **Install the App** on your target repository

3. **Configure environment variables:**
   ```env
   GITHUB_APP_ID=123456
   GITHUB_PRIVATE_KEY=<base64-encoded PEM>
   GITHUB_INSTALLATION_ID=78901234
   ```

   To base64-encode the PEM:
   ```bash
   base64 -i your-app.private-key.pem | tr -d '\n'
   ```

4. **Update `lib/github.ts`** to use `@octokit/auth-app` for App authentication (the current implementation uses PAT for simplicity).

---

## Adding New Document Types

The extraction pipeline is modular. To add support for a new file type:

1. **Update `lib/extract.ts`:**
   ```typescript
   // Add the MIME type to the IMAGE_MIME_TYPES set or create a new extractor
   async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
     // Use mammoth or similar library
     const mammoth = await import('mammoth');
     const result = await mammoth.extractRawText({ buffer });
     return { text: result.value.trim() };
   }
   ```

2. **Update the MIME type allowlist** in `app/api/extract/route.ts`:
   ```typescript
   const ALLOWED_TYPES = new Set([
     ...existing,
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   ]);
   ```

3. **Update the file input** `accept` attribute in `app/page.tsx`:
   ```typescript
   const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx";
   ```

---

## Quality Check Criteria

The quality auditor scores each KB across six dimensions:

| Check | Max Score | What It Evaluates |
|---|---|---|
| **Document Structure** | 20 | Correct heading hierarchy, presence of all required sections (Metadata, Overview, FAQ, Glossary, System Instructions) |
| **FAQ Entry Quality** | 20 | Natural-language questions, concise answers, appropriate confidence levels |
| **Tagging & Metadata** | 15 | Kebab-case tags, proper metadata fields, tag coverage |
| **Chatbot Retrieval Readiness** | 20 | Unique questions, self-contained answers, no circular references, optimal answer length (50–300 words) |
| **System Instructions Quality** | 15 | Comprehensive scope coverage, proper formatting, actionable instructions |
| **Completeness & Coverage** | 10 | All document topics covered, minimum 5 FAQ entries, glossary when needed |

**Grading:**
- **A** = 90–100 (excellent)
- **B** = 80–89 (good)
- **C** = 75–79 (acceptable)
- **D** = 60–74 (needs improvement)
- **F** = 0–59 (failing)

A KB **passes** with a score ≥ 75. Below that, a warning banner is shown and an explicit override is required to push to GitHub.

---

## API Routes

| Route | Method | Input | Output |
|---|---|---|---|
| `/api/extract` | POST | `multipart/form-data` with `file` field | `{ text: string, pageCount?: number }` |
| `/api/generate-kb` | POST | `{ text: string, filename: string }` | SSE stream of `{ text: string }` chunks |
| `/api/quality-check` | POST | `{ markdown: string }` | `QualityReport` JSON |
| `/api/github-push` | POST | `{ markdown: string, title: string, override?: boolean }` | `{ url: string, sha: string }` |

---

## Project Structure

```
/
├── app/
│   ├── page.tsx                    # Upload step
│   ├── review/page.tsx             # Review + quality check step
│   ├── layout.tsx                  # Root layout (fonts, metadata)
│   └── globals.css                 # Design system tokens + animations
├── app/api/
│   ├── extract/route.ts            # PDF/image text extraction
│   ├── generate-kb/route.ts        # Vertex AI KB generation (SSE)
│   ├── quality-check/route.ts      # Vertex AI quality audit
│   └── github-push/route.ts        # GitHub file push via Octokit
├── components/
│   ├── UploadZone.tsx              # Drag-and-drop upload zone
│   ├── KBEditor.tsx                # Markdown editor
│   ├── QualityScorecard.tsx        # Quality report display
│   ├── ProgressStream.tsx          # Real-time progress indicator
│   ├── ConfirmPushModal.tsx        # GitHub push confirmation modal
│   └── Sidebar.tsx                 # Navigation sidebar
├── lib/
│   ├── vertex.ts                   # Vertex AI client singleton
│   ├── extract.ts                  # PDF + OCR extraction logic
│   ├── github.ts                   # Octokit client + push logic
│   └── kb-quality.ts               # Quality report JSON parser
├── types/
│   └── kb.ts                       # TypeScript type definitions
├── .env.local.example              # Environment variable template
└── README.md
```

---

## License

Private — internal tool.
