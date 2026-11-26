# Updating to v1.4 (one time only)

v1.4 merges the PC and phone versions into one GitHub repo and adds self-updating. These steps are needed **once**. After this, updates happen inside the app.

## 1. Put v1.4 on GitHub (about 5 minutes)
1. Unzip `kashmoni.zip` on your PC.
2. Open your repo `ibnusmanedoz/kashmoni-android` on GitHub and click **Add file → Upload files**.
3. In the unzipped `kashmoni` folder, press **Ctrl+H** to show hidden files. Select **everything inside** the folder, including `.github` and `.gitignore`, and drag it onto the upload page. Click **Commit changes**.
4. Open the **Actions** tab and wait about 8 minutes for the green ✓. The run should include a step called **"Build the app UI from the shared code"**.
   - If `.github` didn't upload, open `.github/workflows/main.yml` in the repo, click ✏️, and paste in the contents of the same file from the zip.

## 2. PC (about 5 minutes)
In a terminal:
```bash
sudo apt install -y git
cd ~ && git clone https://github.com/ibnusmanedoz/kashmoni-android.git kashmoni
```
1. Stop the old helper (Ctrl+C in its terminal).
2. In **brave://extensions**, remove the old Kash Moni, then click **Load unpacked** and choose `~/kashmoni/pc/extension`.
3. Start the new helper: `cd ~/kashmoni/pc/helper && python3 kashmoni_helper.py`. Your token stays the same.
4. Open Kash Moni and re-enter your OpenRouter key in ⚙ Settings. Click **Test helper**, then **Save**.

**About your old PC chats:** the old version stored chats under an extension ID that came from its folder. The new version has a permanent ID (`dngghbchpofhhcdnhnfbglkchphdlkkk`), so this never happens again. To bring the old chats over, close Brave and run the commands below. Replace `OLD_ID` with the old extension's ID, which you can see in brave://extensions before you remove it:
```bash
cd ~/.config/BraveSoftware/Brave-Browser/Default
cp -r "Local Extension Settings/OLD_ID" "Local Extension Settings/dngghbchpofhhcdnhnfbglkchphdlkkk"
```
If you don't need the old chats, skip this.

## 3. Phone (about 2 minutes)
1. On the phone, open the repo's **Releases** page and download the newest **KashMoniAI.apk**. Install it over the old app. Your chats stay.
2. Update the Termux helper. In the app, go to ⚙ Settings → Updates → **Check for updates** → **Install update**. Or in Termux, run:
   ```bash
   cd ~/kashmoni-setup && curl -LO https://raw.githubusercontent.com/ibnusmanedoz/kashmoni-android/main/termux/kashmoni_helper.py && cp kashmoni_helper.py ~/kashmoni/
   ```

## 4. Turn on self-improvement
1. ⚙ Settings → Connections → **GitHub**. Paste a token with **repo** and **workflow** permissions, then click **Test** and **Save connection**.
2. ⚙ Settings → Updates should show `ibnusmanedoz/kashmoni-android`.
3. Optional:
   - Spending: set a daily budget, for example $1.
   - Backup: click **Back up to GitHub**.
   - Web search: add a free Brave or Tavily key.
   - Reliability: choose a fallback model.

That's it. From now on, ask Kash Moni to change itself, then install the update from Settings or the phone banner.
