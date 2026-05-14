# workflow-shell

Web-based terminal + file manager for debugging GitHub Actions runners interactively.

## Quick Start

```bash
cd backend && npm install && cd ..
node backend/server.js
# → http://localhost:8080
```

Or via GitHub Actions — go to **Actions** → **workflow-shell** → **Run workflow**. Check "Enable login" if you've set `USERNAME` and `PASSWORD` as repo secrets. The logs will show a public URL.

## Features

- Split-pane UI: file browser on the left, xterm.js terminal on the right
- Browse, upload, download, edit, rename, delete files
- CodeMirror editor with syntax highlighting (Ctrl+S to save)
- Full bash PTY via WebSocket
- Quick Actions — run predefined commands or create your own
- System stats, git status, search across files
- File tree view, command palette (Ctrl+Shift+P)
- Dark/light theme, resizable panes
- Drag to move files, archive/extract zip

## Security

This is made for ephemeral runners — no auth by default, full shell access. On public repos, always enable login and set credentials as secrets. The workspace defaults to `/home/runner/work` to limit exposure.

## Env Vars

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `8080` | Server port |
| `WORKSPACE_DIR` | `~/work` | File manager root |
| `USERNAME` | — | Login username (enables auth) |
| `PASSWORD` | — | Login password (enables auth) |

## Structure

```
backend/         Express server, file API, WebSocket terminal
public/          Frontend (html, css, js)
quick_actions.json     Default quick commands
.github/workflows/     GitHub Actions workflow
```

MIT
