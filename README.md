# Site Surgeon – AI Self-Healing Web System

A full-stack system that **automatically receives bug reports, classifies them with AI, clones the repo locally, attempts a code fix, and opens a GitHub Pull Request** – with zero human involvement for simple bugs.

---

## How It Works

```
Browser (React + Vite)
        │  POST /api/issues/report
        ▼
Express Backend (TypeScript)
        │
        ├── Groq AI Classifier (llama-3.3-70b-versatile)
        │         │
        │    AUTOMATED                    MANUAL
        │         │                         │
        ├── Local Sandbox              Email Admin
        │    ├── git clone repo
        │    ├── install dependencies
        │    ├── Groq Coding Agent
        │    │    ├── identify relevant files
        │    │    ├── read files
        │    │    ├── generate patch
        │    │    └── write fixed files
        │    └── cleanup temp folder
        │
        └── GitHub API (Octokit)
             ├── create branch
             ├── commit files
             ├── open Pull Request
             └── auto-merge (AUTOMATED only)
                      │
               Email Summary → Admin
```

---

## Tech Stack

| Layer        | Technology                                          |
|--------------|-----------------------------------------------------|
| Frontend     | React 18, Vite 5, Tailwind CSS, Axios               |
| Backend      | Node.js 18+, Express, TypeScript                    |
| AI           | Groq API – `llama-3.3-70b-versatile` (free tier)   |
| Sandbox      | Local `child_process` + `fs` (no cloud required)    |
| Version Ctrl | GitHub REST API via Octokit                         |
| Email        | Nodemailer (SMTP / Gmail App Password)              |
| Logging      | Winston                                             |

---

## Project Structure

```
site/
├── backend/
│   ├── src/
│   │   ├── agents/
│   │   │   └── codingAgent.ts          # Groq-powered code fixer
│   │   ├── controllers/
│   │   │   ├── issueController.ts
│   │   │   └── dashboardController.ts
│   │   ├── routes/
│   │   │   ├── issueRoutes.ts
│   │   │   └── dashboardRoutes.ts
│   │   ├── sandbox/
│   │   │   └── sandboxManager.ts       # Local sandbox (git clone + fs)
│   │   ├── services/
│   │   │   ├── aiService.ts            # Groq client (classify + fix)
│   │   │   ├── aiClassifier.ts         # Wraps aiService for pipeline
│   │   │   ├── emailService.ts         # Nodemailer SMTP
│   │   │   ├── githubService.ts        # Octokit PR creation
│   │   │   └── issueProcessor.ts       # Main orchestration pipeline
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── store.ts
│   │   │   └── types.ts
│   │   └── server.ts
│   ├── .env                            # Your secrets (never commit)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── components/
│   │   │   ├── LogViewer.tsx
│   │   │   ├── SeverityBadge.tsx
│   │   │   ├── StatCard.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── hooks/
│   │   │   ├── useDashboard.ts
│   │   │   └── useIssue.ts
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── IssueDetailPage.tsx
│   │   │   └── ReportPage.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── package.json       # Root – runs both servers with concurrently
└── README.md
```

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 18** | https://nodejs.org |
| **npm ≥ 9** | Comes with Node.js |
| **Git** | Must be on your PATH (used for repo cloning) |
| **Groq API key** | Free at https://console.groq.com → API Keys |
| **GitHub Token** | https://github.com/settings/tokens/new — scopes: `repo` |
| **SMTP credentials** | Gmail App Password recommended |

---

## Installation

### On Linux / macOS

```bash
# 1. Clone or download this repository
git clone https://github.com/Prathikshadp/SiteSurgeon.git
cd SiteSurgeon

# 2. Install root dependencies (provides the concurrently runner)
npm install

# 3. Install backend dependencies
cd backend
npm install

# 4. Create and fill in your environment variables
cp .env.example .env   # or: nano .env
# Fill in the values (see .env reference below)

# 5. Go back to root and start everything
cd ..
npm run dev
```

Open http://localhost:5173 in your browser.

---

### On Windows (Command Prompt or PowerShell)

```bat
REM 1. Clone the repository
git clone https://github.com/Prathikshadp/SiteSurgeon.git
cd SiteSurgeon

REM 2. Install root dependencies
npm install

REM 3. Install backend dependencies
cd backend
npm install

REM 4. Create your .env file (copy the example or create manually)
copy .env.example .env
REM Open .env in Notepad and fill in your keys:
notepad .env

REM 5. Go back to root and start
cd ..
npm run dev
```

Open http://localhost:5173 in your browser.

> **Windows tip:** Make sure `git` is on your PATH. Download from https://git-scm.com/download/win if needed.

---

### Run servers separately (optional)

If you prefer two terminals instead of `concurrently`:

**Linux / macOS — Terminal 1:**
```bash
cd backend && npm run dev
```

**Linux / macOS — Terminal 2:**
```bash
cd frontend && npm run dev
```

**Windows — Terminal 1 (cmd or PowerShell):**
```bat
cd backend && npm run dev
```

**Windows — Terminal 2:**
```bat
cd frontend && npm run dev
```

---

## Environment Variables (`backend/.env`)

Create `backend/.env` with the following:

```env
# Server
PORT=3000
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info

# Groq AI (free — https://console.groq.com)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
GITHUB_DEFAULT_BRANCH=main

# SMTP Email (Gmail App Password recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
NOTIFICATION_EMAIL=you@gmail.com

# Demo Mode (set true to skip AI/sandbox for quick demos)
DEMO_MODE=false
```

### How to get each key

| Variable | How to get it |
|----------|--------------|
| `GROQ_API_KEY` | https://console.groq.com → API Keys → Create Key (free) |
| `GITHUB_TOKEN` | https://github.com/settings/tokens/new → select `repo` scope |
| `GITHUB_OWNER` | Your GitHub username (e.g. `johndoe`) |
| `GITHUB_REPO` | The repository name (e.g. `MyProject`) |
| `SMTP_HOST` | `smtp.gmail.com` for Gmail |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail App Password: https://myaccount.google.com/apppasswords |
| `NOTIFICATION_EMAIL` | Where alerts are sent (can be same as `SMTP_USER`) |

---

## API Reference

### `POST /api/issues/report`

Submit a bug and start the AI pipeline.

```json
{
  "title": "Login button throws 500",
  "description": "Clicking the login button causes an unhandled exception",
  "stepsToReproduce": "1. Open /login  2. Enter credentials  3. Click Sign In",
  "severity": "low",
  "repoUrl": "https://github.com/your-username/your-repo"
}
```

**Response:**

```json
{
  "message": "Issue received. AI pipeline started.",
  "issueId": "abc123",
  "status": "received"
}
```

### `GET /api/issues/:id`

Poll the status of an issue.

**Possible `status` values:**

| Status | Meaning |
|--------|---------|
| `received` | Issue logged, pipeline starting |
| `classifying` | Groq deciding AUTOMATED vs MANUAL |
| `sandboxing` | Cloning repo locally |
| `fixing` | AI generating code patch |
| `pr_opened` | Pull Request created on GitHub |
| `merged` | PR auto-merged |
| `notified` | Manual review email sent to admin |
| `failed` | Pipeline error |

### `GET /api/dashboard/issues`

Returns all issues for the dashboard.

### `GET /health`

Health check — returns `{"status":"ok"}`.

---

## Severity Guidelines

| Severity | AI tends to classify as | Example |
|----------|------------------------|---------|
| `low` | AUTOMATED | Typo in button label |
| `medium` | AUTOMATED | Missing null check |
| `high` | MANUAL | Auth bypass |
| `critical` | MANUAL | Data loss risk |

---

## Troubleshooting

**Port 3000 already in use**

```bash
# Linux / macOS
fuser -k 3000/tcp

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**git not found in sandbox**

Install Git and make sure it is on your PATH:
- Linux: `sudo apt install git`
- macOS: `xcode-select --install`
- Windows: https://git-scm.com/download/win

**Groq returns MANUAL for simple bugs**

Use `severity: low` and a very specific description. Groq is conservative with vague reports.

**Email not sending**

Use a Gmail **App Password** (not your login password). Enable 2FA first, then generate one at https://myaccount.google.com/apppasswords.

---

## License

MIT
