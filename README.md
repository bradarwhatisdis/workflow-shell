# Workflow Shell

> A premium web-based terminal + file manager for debugging GitHub Actions runners in real time.

[![MIT](https://img.shields.io/badge/license-MIT-lightgrey?style=flat)](LICENSE)

---

## Overview

Workflow Shell gives you full shell access to a running GitHub Actions job through your browser. Launch it via `workflow_dispatch`, get a public URL, and debug builds, inspect the filesystem, run commands, and transfer files — all without leaving your browser.

It's designed for **ephemeral CI runners**: no persistent infrastructure, no setup, just a single workflow run that spins up a web server, connects a terminal, and cleans up when done.

---

## Features

### Terminal
- Full interactive bash session backed by **node-pty** + **xterm.js**
- WebSocket transport with automatic reconnection
- Resize handling, 10k-line scrollback, copy/paste
- Monochrome theme optimized for low latency

### File Manager
- Browse directory tree with breadcrumb navigation
- Upload via drag-and-drop or file picker with progress bars
- Download any file with a single click
- Inline rename (double-click or F2)
- Create files and folders
- Delete with confirmation dialog
- **Full-page drag-drop upload** — drag files from your desktop anywhere on the page
- **Drag to move** — drag files onto folder items to move them

### Editor
- Built-in code editor powered by **CodeMirror**
- Syntax highlighting for JavaScript, Python, Shell, CSS, HTML, JSON, YAML, Markdown, XML
- Save via Ctrl+S
- Unsaved changes warning

### Quick Actions
- Pre-defined commands: Disk Usage, Memory Info, List Processes, Check Uptime, Git Log
- Run commands with one click — output shown in a focused overlay
- **CRUD API** — add, edit, or delete custom actions through the UI
- Actions persisted to `quick_actions.json` and auto-committed to the repo

### System Dashboard
- Real-time disk usage, memory stats, CPU load averages
- Color-coded cards (green/yellow/red) for at-a-glance health checks
- System uptime display

### Git Status Panel
- Current branch display
- Changed files with status badges (M/A/D)
- Recent commit history with hashes

### Full-Text Search
- Search across the entire workspace
- Results with file name, line number, and highlighted matches
- Click results to navigate

### File Tree
- Collapsible directory tree view toggleable from the file pane
- Click to navigate, expand subdirectories

### Archive & Extract
- Right-click any file or folder → **Add to Archive** (creates .zip)
- Right-click a .zip file → **Extract Here**
- Powered by server-side archiver

### Session Timer
- Elapsed time display with MM:SS format
- Info tooltip showing workflow timeout limits (30-min job, 25-min step, etc.)

### Kill & Shutdown
- **Kill button** terminates the server, SSH tunnel, and all proxy processes
- Custom confirmation modal (no browser popup)
- Graceful shutdown message

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+F` | Toggle file filter |
| `Ctrl+N` | New file / folder |
| `Ctrl+R` | Refresh file list |
| `Ctrl+Shift+P` | Command palette |
| `F2` | Rename selected file |
| `Delete` | Delete selected file |
| `?` | Toggle help modal |
| `Esc` | Close modal / search |

### Command Palette
- Press `Ctrl+Shift+P` to open a VS Code-style command palette
- Fuzzy-filter through all available actions
- Navigate with arrow keys, select with Enter

### Theme
- Dark and light themes
- **Dark** — true black background (#000), white text, sharp editorial aesthetic
- **Light** — clean white background, black text
- Preference persisted to localStorage

---

## Quick Start

### Local Development

```bash
# Install dependencies
cd backend && npm install

# Start the server
node backend/server.js
# → open http://localhost:8080

# Or use the convenience script
./scripts/local.sh
# → starts server + pinggy tunnel for public access

# Kill everything
./scripts/local.sh --kill
```

### On a GitHub Actions Runner

1. Go to your repository's **Actions** tab
2. Select **workflow-shell** in the left sidebar
3. Click **Run workflow**
4. (Optional) Enable **login authentication** if you've set `USERNAME` and `PASSWORD` as repository secrets
5. Watch the logs for the public URL (provided by pinggy.io)
6. Open the URL in your browser

The workflow runs for **30 minutes** (25-minute step timeout). The session timer helps you track remaining time.

---

## Authentication

By default, the server starts with **no authentication**. Anyone with the URL gets full shell access.

For public repositories or production use, enable login:
1. Add `USERNAME` and `PASSWORD` as [repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
2. Run the workflow with **Enable login** checked
3. Users will be prompted with a login page before accessing the shell

**Session tokens** expire after 5 minutes of inactivity.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────┐  ┌───────────┐  ┌───────┐  ┌─────────────────┐ │
│  │ Terminal │  │   File    │  │ Quick │  │  Stats / Git /  │ │
│  │ (xterm)  │  │  Manager  │  │Actions│  │    Search       │ │
│  └────┬─────┘  └─────┬─────┘  └───┬───┘  └───────┬─────────┘ │
│       │              │            │              │           │
│    WebSocket     HTTP REST    HTTP REST      HTTP REST       │
└───────┼──────────────┼────────────┼──────────────┼───────────┘
        │              │            │              │
┌───────┼──────────────┼────────────┼──────────────┼───────────┐
│       ▼              ▼            ▼              ▼           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Express + WebSocket Server              │    │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐   │    │
│  │  │node--pty│  │ File  IO │  │execSync│  │Git/Stat│   │    │
│  │  └─────────┘  └──────────┘  └────────┘  └────────┘   │    │
│  └──────────────────────────┬───────────────────────────┘    │
│                             │                                │
│               ┌─────────────┴─────────────┐                  │
│               │     pinggy.io tunnel      │                  │
│               │    (SSH reverse proxy)    │                  │
│               └───────────────────────────┘                  │
│                      Server (runner)                         │
└──────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Vanilla JS, xterm.js, CodeMirror | UI in the browser |
| Backend | Express.js, node-pty, ws | HTTP API + WebSocket terminal |
| Terminal | node-pty + xterm.js | Full PTY-based bash session |
| Tunnel | pinggy.io (SSH reverse proxy) | Public URL for the local server |
| Auth | 32-char session token | Optional login with 5-min TTL |
| Persistence | quick_actions.json | Quick action definitions, auto-committed |

---

## Project Structure

```
workflow-shell/
├── backend/
│   └── server.js              Express server, API routes, WebSocket, PTY
├── public/
│   ├── index.html             Main application page
│   ├── login.html             Authentication page
│   ├── css/
│   │   └── style.css          Complete UI stylesheet
│   ├── js/
│   │   ├── app.js             File manager, panels, modals, event handling
│   │   ├── terminal.js        xterm.js setup, WebSocket terminal
│   │   └── utils.js           Pane resizer, modal helpers
│   └── vendor/
│       └── xterm/             xterm.js library (installed by npm)
├── scripts/
│   ├── run.sh                 CI entrypoint — starts server + pinggy tunnel
│   └── local.sh               Local dev script with --kill flag
├── .github/
│   └── workflows/
│       └── workflow.yml       GitHub Actions workflow definition
├── quick_actions.json         Default and custom quick action commands
└── package.json               Project metadata
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Authenticate with username/password, returns session token |

**Headers:** Pass `x-session-token` on all authenticated requests (or `?token=` query param).

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files?path=` | List directory contents |
| GET | `/api/file?path=` | Read file content |
| PUT | `/api/file?path=` | Create or update file |
| DELETE | `/api/file?path=` | Delete file or directory |
| GET | `/api/download?path=` | Download file (binary) |
| POST | `/api/upload` | Upload file (multipart form) |
| POST | `/api/file/move` | Move/rename file or directory |
| GET | `/api/files/tree` | Get full directory tree |
| POST | `/api/archive` | Create a .zip archive |
| POST | `/api/extract` | Extract a .zip archive |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system-stats` | Disk, memory, CPU, uptime |
| GET | `/api/git-status` | Branch, changes, recent commits |
| GET | `/api/cwd` | Current workspace directory |
| GET | `/api/search?q=` | Full-text search in workspace |

### Quick Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quick-actions` | List all quick actions |
| POST | `/api/quick-actions` | Create a new quick action |
| DELETE | `/api/quick-actions` | Delete a quick action |
| POST | `/api/quick-actions/run` | Execute a quick action command |

### Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/kill` | Terminate server and all processes |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host/` | Interactive terminal (PTY) session |
| `ws://host/watch` | File change notifications (best-effort) |

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `8080` | No | HTTP server port |
| `WORKSPACE_DIR` | `~/work` | No | Root directory for the file manager |
| `USERNAME` | — | No | Enables login authentication |
| `PASSWORD` | — | No | Enables login authentication |

When both `USERNAME` and `PASSWORD` are set:
- The login page is shown on first visit
- A 32-character session token is issued after successful login
- Tokens expire after 5 minutes of inactivity
- Unauthenticated API requests return HTTP 401

---

## Design

The UI follows a **Bento Grid** layout with a **minimalist editorial** aesthetic:

- **Color palette:** Clean white (#fff) and dark black (#000) — no gradients, no neon
- **Typography:** Inter — high contrast, sharp, modern sans-serif
- **Borders:** 1px solid razor-sharp borders
- **Shadows:** Subtle and restrained
- **Layout:** CSS Grid — 300px sidebar + flexible main area
- **No glassmorphism,** no 3D shapes, no decorative flourishes — every pixel serves a purpose

---

## Security Notes

- The tool provides **full shell access** to the runner. Use login authentication on public repositories.
- Session tokens are stored in `localStorage` and sent as custom headers.
- The server has no CSRF protection — it's designed for single-user debugging sessions.
- The kill endpoint (`POST /api/kill`) terminates the entire server process.
- pinggy.io provides the reverse tunnel — traffic passes through their servers.

---

## License

MIT
