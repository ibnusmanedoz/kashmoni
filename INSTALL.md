# Fresh install of Kash Moni AI (about 20 minutes)

## 1. Create the repo and upload (on the PC)
1. On github.com, click **+ → New repository**. Name it exactly **`kashmoni`** and choose **Public**. Public is needed so the app and helper can download updates without a password. The repo holds no secrets, because your keys stay on your devices. Don't add a README. Click **Create repository**.
2. Click **uploading an existing file**.
3. Unzip `kashmoni.zip`, open the `kashmoni` folder, and press **Ctrl+H** to show hidden files. Select **everything inside**, including `.github` and `.gitignore`, and drag it onto the page. Click **Commit changes**.
4. Open the **Actions** tab and wait about 8 minutes for the green ✓. **Releases** then shows **KashMoniAI.apk**.
   - If there's no run in Actions, `.github` didn't upload. Click **Add file → Create new file**, name it `.github/workflows/main.yml`, paste in the contents of that file from the zip, and commit.

## 2. PC (Zorin)
Remove anything left from the old installs. In **brave://extensions**, remove every old Kash Moni, then run:
```bash
sudo apt install -y git python3 nodejs npm
rm -rf ~/kashmoni            # only if an old copy exists here
cd ~ && git clone https://github.com/ibnusmanedoz/kashmoni.git kashmoni
cd ~/kashmoni/pc/helper && python3 kashmoni_helper.py
```
Keep that terminal open. It prints the **token**.
1. In Brave, go to **brave://extensions**, turn on **Developer mode**, click **Load unpacked**, and choose `~/kashmoni/pc/extension`.
2. Click the **KM** icon (or press Alt+K), then go to ⚙ Settings:
   - **OpenRouter:** paste your key → **Test key & balance**.
   - **Workspace helper:** paste the token → **Test helper**.
   - Click **Save**.
3. **Optional, start the helper on login:** open Startup Applications → Add, with the command `python3 /home/YOUR_NAME/kashmoni/pc/helper/kashmoni_helper.py`.

## 3. Phone
1. **For a clean start**, uninstall the old Kash Moni app first, since installing over it would keep its chats. Then open `github.com/ibnusmanedoz/kashmoni/releases` on the phone, download **KashMoniAI.apk**, and install it.
2. Open the app → ⚙ Settings → paste your OpenRouter key → **Save**.
3. **Termux helper, to build apps on the phone:**
   ```bash
   rm -rf ~/kashmoni ~/kashmoni-setup
   pkg update -y && mkdir -p ~/kashmoni-setup && cd ~/kashmoni-setup
   curl -LO https://raw.githubusercontent.com/ibnusmanedoz/kashmoni/main/termux/kashmoni_helper.py
   curl -LO https://raw.githubusercontent.com/ibnusmanedoz/kashmoni/main/termux/setup.sh
   bash setup.sh
   kashmoni
   ```
   Paste the printed token into ⚙ Settings → Workspace helper → **Test helper** → **Save**.

## 4. Turn everything on (both devices)
1. ⚙ Settings → Connections → **GitHub**. Create a token at github.com/settings/tokens → *Generate new token (classic)* → tick **repo** and **workflow**. Paste it, then click **Test** and **Save connection**.
2. **Strong model:** click **Load model list**, then pick Kimi K2.6 in "Strong model".
3. **Spending:** set a daily budget, for example `1`.
4. **Behaviour:** choose "Never ask - full permission" if you want no permission prompts.
5. Optional:
   - Web search: add a free Brave or Tavily key.
   - Backup: **Back up to GitHub** (creates the private repo `kashmoni-backup`).

## Updating from now on
- **Change it:** ask Kash Moni in chat, for example *"add a dark/light theme switch"*. Turn on ⚡ Strong for bigger changes. It edits the `kashmoni` repo and GitHub builds the new version.
- **PC:** ⚙ Settings → Updates → **Install update**. **Undo last update** rolls back.
- **Phone:** tap **Install** on the green update banner. Your chats stay.
- If something breaks, say *"undo your last change"*.
