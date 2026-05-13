# workflow-shell

A web-based terminal and file manager for interactively debugging GitHub Actions runners.

## Features

- **Split-pane UI** — File manager on the left, terminal on the right
- **Resizable panes** — Drag the divider to adjust sizes
- **File Manager** — Browse, upload, download, edit, create, and delete files
- **Code Editor** — Edit files in-browser with syntax highlighting (CodeMirror)
- **Terminal** — Full xterm.js terminal via WebSocket with bash PTY
- **Smooth animations** — Fade-in, slide, and hover effects throughout
- **Upload** — Drag & drop or browse to upload files
- **Dark theme** — Custom dark UI designed for terminal workflows

## Quick Start

### Prerequisites

- Node.js 18+
- Git

### Local Development

```bash
cd workflow-shell
cd backend && npm install && cd ..
node backend/server.js
# Open http://localhost:8080
```

### With GitHub Actions (Remote Runner)

Use the provided workflow in `.github/workflows/workflow.yml`:

1. Go to your repo → **Actions** → **workflow-shell** → **Run workflow**
2. Wait for the setup to complete
3. The Action logs will show the public URL to access the shell

## Architecture

```
┌─────────────────────────────────────────────┐
│  Topbar (title, cwd, upload, new, refresh)  │
├────────────────┬────────────────────────────┤
│  File Manager  │  Terminal (xterm.js)       │
│                │                             │
│  - Browse dirs │  - Full bash PTY           │
│  - Upload      │  - WebSocket to node-pty   │
│  - Download    │                             │
│  - Edit files  │                             │
│  - Delete      │                             │
├────────────────┴────────────────────────────┤
│  Backend: Node.js + Express + node-pty + ws │
└─────────────────────────────────────────────┘
```

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `server.js` | Express server, file API, WebSocket terminal |
| `package.json` | Dependencies |

**API Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files?path=` | List directory contents |
| `GET` | `/api/file?path=` | Read file content |
| `PUT` | `/api/file?path=` | Create/write file or directory |
| `DELETE` | `/api/file?path=` | Delete file or directory |
| `GET` | `/api/download?path=` | Download a file |
| `POST` | `/api/upload` | Upload a file (multipart) |
| `WS` | `/` | Terminal WebSocket |

### Frontend (`public/`)

| File | Purpose |
|------|---------|
| `index.html` | Main HTML structure |
| `css/style.css` | Styling + animations |
| `js/app.js` | File manager logic |
| `js/terminal.js` | xterm.js setup + WebSocket |
| `js/utils.js` | Resizable panes, modal close, path utils |

## File Manager Features

- **Navigate** — Click folders to browse, use breadcrumbs to go up
- **Upload** — Drag & drop files or click the upload button
- **Download** — Click the download button next to any file
- **Edit** — Click a file to open the CodeMirror editor (Ctrl+S / Cmd+S to save)
- **Delete** — Click the trash icon (with confirmation dialog)
- **Create** — Use the + buttons in the topbar to create files or folders

## Security Notes

> ⚠️ **This tool is designed for ephemeral GitHub Actions runners.** It intentionally has **no authentication** since runners are short-lived and private.

- The file browser has **no auth** — anyone with the URL can access the runner's filesystem
- The terminal gives **full shell access** to the runner
- Only use this on **private/ephemeral runners** you control
- The workspace path (`/home/runner/work`) is the default to limit exposure

## Customization

- **Port**: Set `PORT` environment variable (default: `8080`)
- **Workspace**: Change `WORKSPACE` in `backend/server.js` (default: `/home/runner/work`)
- **Terminal**: Change the shell in `pty.spawn()` (default: `/bin/bash`)

## License

MIT