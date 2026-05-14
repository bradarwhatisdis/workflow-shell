# workflow-shell

```

░██╗░░░░░░░██╗░░░░░░░██████╗██╗░░██╗███████╗██╗░░░░░██╗░░░░░
░██║░░██╗░░██║░░░░░░██╔════╝██║░░██║██╔════╝██║░░░░░██║░░░░░
░╚██╗████╗██╔╝█████╗╚█████╗░███████║█████╗░░██║░░░░░██║░░░░░
░░████╔═████║░╚════╝░╚═══██╗██╔══██║██╔══╝░░██║░░░░░██║░░░░░
░░╚██╔╝░╚██╔╝░░░░░░░██████╔╝██║░░██║███████╗███████╗███████╗
░░░╚═╝░░░╚═╝░░░░░░░░╚═════╝░╚═╝░░╚═╝╚══════╝╚══════╝╚══════╝
```

Web-based terminal + file manager. Debug GitHub Actions runners from your browser.

[![MIT](https://img.shields.io/badge/license-MIT-purple?style=flat)](LICENSE)
[![Node](https://img.shields.io/badge/node-18%2B-3fb950?style=flat)](#)

---

### Run locally

```bash
cd backend && npm install && cd ..
node backend/server.js
# open http://localhost:8080
```

### Or on a runner

Go to **Actions** → **workflow-shell** → **Run workflow**.  
Enable login if you've set `USERNAME` & `PASSWORD` as repo secrets.  
The logs will print a public URL.

---

### What's inside

- File manager — browse, upload, download, edit, rename, delete files
- Terminal — full bash session via WebSocket (xterm.js + node-pty)
- Quick Actions — predefined commands, or add your own
- System stats, git status, full-text search
- File tree, command palette (`Ctrl+Shift+P`)
- Zip archive & extract, drag to move files
- Dark & light themes, resizable panes
- Optional login auth with 5-min session

### Files

```
backend/server.js          Express + WebSocket server
public/                    Frontend (html, css, js)
quick_actions.json         Default quick commands
.github/workflows/         GitHub Actions workflow
```

### Env

| Var | Default | |
|-----|---------|-|
| `PORT` | `8080` | Server port |
| `WORKSPACE_DIR` | `~/work` | Root directory for file manager |
| `USERNAME` | — | Enables login auth |
| `PASSWORD` | — | Enables login auth |

---

> Built for ephemeral runners — no auth by default, full shell access.  
> Always enable login on public repos. MIT license.
