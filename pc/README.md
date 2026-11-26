# Kash Moni AI - feature guide (v1.4)

> Install and update steps are in the main **README.md** at the top of the repo. This file explains each feature in detail.

Your own AI agent in Brave. It chats, reads and controls your browser tabs, debugs websites, searches the web, and builds apps in a workspace folder on your PC. When an app is done, it saves a zip to your Downloads folder with run instructions.

It's powered by your OpenRouter key and uses **DeepSeek V4.1 Flash** by default.

```
pc/
├── extension/   ← load this folder into Brave
└── helper/      ← small Python program that gives the AI a workspace (files + terminal)
```

---

## 1. Install the extension (one time)

1. Get the code with `git clone https://github.com/ibnusmanedoz/kashmoni-android.git ~/kashmoni` (see the main README.md).
2. In Brave, go to **brave://extensions**.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `kashmoni/pc/extension` folder.
5. Pin it with the puzzle icon, then click the **KM** icon. You can also press **Alt+K**. Kash Moni opens in the side panel.

## 2. Add your OpenRouter key

1. In the panel, click **⚙ Settings**.
2. Paste your key from https://openrouter.ai/keys
3. Click **Test key & balance** to check that it works.
4. Leave **Main model** as `deepseek/deepseek-v4.1-flash`, or click **Load model list** to choose another model. Only models that support tools are shown.
5. Optional: set a **Strong model** for big jobs. Ticking **⚡ Strong** under the chat box uses it for that message only.
6. Click **Save**.

Chatting, web search and browser control work now.

## 3. Start the workspace helper (needed for building apps)

Open a terminal:

```bash
cd ~/kashmoni/pc/helper
python3 kashmoni_helper.py
```

It prints an **Address** (`http://127.0.0.1:8765`) and a **Token**. Paste both into **Settings → Workspace helper**, click **Test helper**, then **Save**. The chip under the chat box turns green: **● Workspace**.

- Projects are created in `~/KashMoniProjects/`.
- Finished zips are saved to `~/Downloads/KashMoni/`.
- Keep the terminal open while you build. Press Ctrl+C to stop the helper.
- Forgot the token? Run `python3 kashmoni_helper.py --show-token`.

For app building you'll usually also want these:

```bash
sudo apt install -y nodejs npm git python3-pip python3-venv
```

### Optional: start the helper automatically on login (Zorin)
Open **Startup Applications**, click **Add**, and use this command:
`python3 /home/YOUR_NAME/kashmoni/pc/helper/kashmoni_helper.py`

---

## Using it

- **Ask anything**, just like a normal chat.
- **"Debug this page"**: it reads console errors and failed network requests, reloads to catch errors during page load, and explains how to fix them.
- **"Fill this form with…" or "Go to X and find Y"**: it reads the page, clicks and types.
- **"Build me a … app"**: it plans the app, writes the files, installs packages, runs the app, opens it in Brave to test it, fixes errors, writes a README, then zips it to `Downloads/KashMoni/`.
- **Stop** (■) halts the current task at any time.
- **☰** opens your chat history, and **＋** starts a new chat.
- Each tool step shows as a row. Tap a row to see exactly what the AI sent and what it got back.
- The **$** chip shows how much the current chat has cost.

### Attachments
Tap **📎**, paste an image, or drag files onto the panel:
- **Images** (screenshots, designs, photos): the AI sees them.
- **PDFs**: their text is read through OpenRouter's free PDF parser.
- **Code and text files**: the content is sent to the AI.
- **Other files** (zip, docx, xlsx…): saved to `KashMoniProjects/_uploads/` so the AI can open them with workspace tools. This needs the helper running.

### Images
Ask for an image, like *"make a logo for my bakery app"* or *"create a hero image for this site"*. To edit a picture, attach it and say *"remove the background"*.
- The image shows up in the chat with a **⬇ Save** button. Tap an image to view it full size.
- It can save images straight into a project, for example *"…and save it as my-app/assets/logo.png"*.
- The default model is Nano Banana 2 (`google/gemini-3.1-flash-image`), at a few cents per image. You can change it in ⚙ Settings → Images.

### 3D models (three.js)
Ask for something like *"make a 3D model of a modern office chair"* or *"a low-poly island scene with palm trees"*.
- The AI writes three.js code. Kash Moni runs it and shows a card with a snapshot. The AI also receives that snapshot, so it can check its own work and fix mistakes.
- **Open 3D** opens a full viewer where you can rotate, zoom and pan. **GLB** downloads the model for Blender, Unity, Godot or websites. **PNG** saves a picture, and **Code** copies the three.js code.
- If you add *"…and save it to 3d/chair"*, it also writes a standalone `index.html` viewer into your workspace that you can open or host.
- These are built from code (shapes, curves, materials), so they suit products, furniture, buildings, logos and low-poly scenes. They aren't suited to realistic faces or scanned-looking objects.

### Memory
Kash Moni remembers facts between chats, like your name, preferred stack or projects. Say *"remember that…"*, or it saves useful facts on its own. It can also search your past chats when you mention something from before. You can view, add or delete memories, or turn memory off, in **⚙ Settings → Memory**.

### Connections (GitHub and others)
Go to **⚙ Settings → Connections**, pick a service, click **Add**, paste a token, then click **Test** and **Save connection**.
- **GitHub:** create a token at github.com/settings/tokens → *Generate new token (classic)* → tick **repo** and **workflow**.
- Vercel, Netlify, Supabase, Cloudflare and Telegram bots are preset. **Other** works for any API that uses a token.
- The AI uses connections through the `call_api` tool, and workspace commands get the token as an environment variable (for example `$GITHUB_TOKEN` for `git push`). The token itself is never shown to the AI. If it appears in output, it's replaced with `[token]`.

### Safety
- To stop all permission questions, set **Settings → Ask before actions → Never ask - full permission**.
- Otherwise it **asks before risky actions**: clicking buttons like *pay, buy, order, send, post, delete, submit*, submitting POST or login forms, deleting files, and dangerous commands like `rm -rf`, `sudo` or `git push`. You can change this in Settings.
- While it inspects a tab, Brave shows a bar saying an extension "started debugging this browser". That's normal. If you click Cancel on that bar, it stops capturing console and network logs for that tab.
- Your key and chats are stored only in this browser profile. The helper only listens on your own PC (127.0.0.1) and requires the token.
- It can't control `brave://` pages or the extension store. Browsers block that for all extensions.

### Tips to save money
- Asking it to read a page is cheap. Screenshots cost more, so it only takes them when it needs to.
- Start a new chat (＋) for each new task. Long chats send more text with every step.
- Set **Thinking effort** to *Low* for simple tasks.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Clicking the icon does nothing | Update Brave to the latest version (the side panel needs a recent Brave). |
| "OpenRouter rejected your API key" | Re-paste the key in Settings, then use Test key. |
| "Not enough OpenRouter credit" | Top up at openrouter.ai/credits. |
| ○ Workspace off | The helper isn't running, or the address or token is wrong. Run `python3 kashmoni_helper.py` and click Test helper. |
| "Could not attach debugger" | Close DevTools (F12) on that tab, then try again. |
| Element not found | The page changed. It will usually call read_page again by itself, or you can ask it to. |
| Stopped after 40 steps | Type `continue`, or raise **Max steps** in Settings. |

## What's next (v2)
An Android APK with its own built-in browser, using the same brain, plus the helper running in Termux so your phone can build apps too.
