# Kash Moni AI (v1.4)

Your own AI agent for your PC (a Brave extension) and your phone (an Android app). Both run on your OpenRouter key.

**What it does**
- Chat with streaming replies, using DeepSeek V4.1 Flash by default, with ⚡ Strong for hard jobs and an automatic fallback model.
- **Browser:** reads, clicks and types on pages, and debugs console errors and network requests. It uses your real Brave on the PC and a built-in browser on the phone.
- **Workspace:** builds apps on your computer (files, terminal, dev servers, testing), then zips them with run instructions.
- Images (generate and edit), **3D models** (three.js, with GLB export), and web search (DuckDuckGo, Brave or Tavily).
- Attachments (images, PDFs, code, any file), voice 🎤 / 🔊, memory between chats, and projects.
- Connections (GitHub, Vercel, Netlify, Supabase, Cloudflare, Telegram, any API), spending limits, backups, and long chats that get summarized automatically.
- **Self-update:** ask Kash Moni to change itself. It edits this repo, GitHub builds the new version, and you install it with one tap.

```
pc/extension/   Brave extension + the shared brain (js/agent.js, js/tools.js)
pc/helper/      Workspace helper (Python) - also updates the PC install
app/            Android app (native part: MainActivity.java)
web/            Android UI - generated from pc/extension by build-web.sh
termux/         Phone workspace helper setup
tools/          Build helpers
.github/        GitHub Actions: builds the APK on every push
```

---

## Install on the PC (Zorin / Ubuntu)

```bash
sudo apt install -y git python3 nodejs npm
cd ~ && git clone https://github.com/ibnusmanedoz/kashmoni-android.git kashmoni
```

1. In Brave, go to **brave://extensions**, turn on **Developer mode**, click **Load unpacked**, and choose `~/kashmoni/pc/extension`.
2. Start the workspace helper and keep this terminal open:
   ```bash
   cd ~/kashmoni/pc/helper && python3 kashmoni_helper.py
   ```
3. Open Kash Moni (KM icon or **Alt+K**), go to ⚙ Settings, paste your OpenRouter key and the helper token, then click **Save**.

**Start the helper automatically:** open Zorin **Startup Applications**, click **Add**, and enter the command `python3 /home/YOUR_NAME/kashmoni/pc/helper/kashmoni_helper.py`.

## Install on the phone (Android 10+)

1. Download **KashMoniAI.apk** from this repo's **Releases** page, open it and tap **Install**.
2. Open the app, go to ⚙ Settings, and paste your OpenRouter key.
3. **Optional, to build apps on the phone:** install **Termux** from F-Droid, then run:
   ```bash
   pkg update -y && mkdir -p ~/kashmoni-setup && cd ~/kashmoni-setup
   curl -LO https://raw.githubusercontent.com/ibnusmanedoz/kashmoni-android/main/termux/kashmoni_helper.py
   curl -LO https://raw.githubusercontent.com/ibnusmanedoz/kashmoni-android/main/termux/setup.sh
   bash setup.sh
   kashmoni
   ```
   Paste the token it prints into ⚙ Settings → Workspace helper.
4. **Or use the PC's helper over your hotspot:** on the PC, run `python3 kashmoni_helper.py --host 0.0.0.0`. In the app, set the address to `http://PC-IP:8765`. Find the PC's IP with `hostname -I`.

---

## Updating (no Claude needed)

**Getting updates**
- **PC:** ⚙ Settings → **Updates** → **Check for updates** → **Install update**. The helper downloads the new code and Kash Moni reloads itself. **Undo last update** rolls back.
- **Phone:** a green **"update available"** banner appears. Tap **Install**, wait for the download, and tap the APK to install it. Your chats and settings stay. Termux helper updates install from the same button.

**Changing Kash Moni**
1. Add a **GitHub connection** (⚙ Settings → Connections → GitHub; the token needs **repo** and **workflow** permissions).
2. Make sure the workspace helper is running.
3. Ask it in chat, for example *"Kash Moni, add a button that exports a chat as a PDF"*. Switch on ⚡ Strong (Kimi) for bigger changes.
4. It clones this repo into its workspace, saves a backup tag, makes the change, checks that it builds, and pushes. GitHub then builds the new APK in about 8 minutes.
5. Install the update as described above. If something breaks, tell it *"undo your last change"*, or use **Undo last update** on the PC.

## Features at a glance

| Where | What |
|---|---|
| 📁 chip | Projects: separate chats, instructions and workspace folder for each project |
| 📎 / 🎤 | Attach files or images / speak your message |
| 🔊 / 🔇 chip | Read replies aloud |
| ⚡ Strong | Use your strong model for this message |
| Settings → Spending | Daily/monthly budgets, "ask me every $X", and a usage table |
| Settings → Backup | Backup file or private GitHub repo `kashmoni-backup`, and restore |
| Settings → Reliability | Fallback model, and when to summarize long chats |
| Settings → Web search | DuckDuckGo (free), or Brave/Tavily (free API keys, more reliable) |
| Settings → Connections | GitHub, Vercel, Netlify, Supabase, Cloudflare, Telegram, custom APIs |
| Settings → Memory | What it remembers about you; add or delete entries |

More details about every feature are in `pc/README.md`.

## Troubleshooting

| Problem | Fix |
|---|---|
| ○ Workspace off | Start the helper, then check the address and token in Settings |
| "Update failed (local changes?)" | Run `cd ~/kashmoni && git stash`, then try again |
| Phone update won't install | Uninstall only if Android says the signature differs (it shouldn't). Back up first |
| 🎤 does nothing on PC | A tab opens asking for the microphone. Click **Allow**, then try again |
| A GitHub build fails | Open Actions → the failed run → the red step. Paste the error to Kash Moni (⚡ Strong) and ask it to fix it |
| Budget reached | Raise it in Settings → Spending |
