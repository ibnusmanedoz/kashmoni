#!/usr/bin/env bash
# Builds the Android app UI from the shared PC extension code.
#   pc/extension/js/*   -> web/shared/   (the brain + tools, shared by both)
#   pc/extension/sidepanel.js -> web/app.js (Android UI, via tools/make_app_js.py)
#   then bundles everything into app/src/main/assets/app/
# Needs: python3 and Node.js (npx downloads esbuild the first time).
set -e
cd "$(dirname "$0")"
mkdir -p web/shared app/src/main/assets/app
cp pc/extension/js/agent.js pc/extension/js/tools.js pc/extension/js/markdown.js web/shared/
cp pc/extension/viewer.html pc/extension/viewer.bundle.js web/
cp pc/helper/kashmoni_helper.py termux/kashmoni_helper.py
python3 tools/make_app_js.py pc/extension/sidepanel.js
OUT=app/src/main/assets/app
npx --yes esbuild@0.24 web/app.js --bundle --format=iife --target=chrome80 --charset=utf8 --outfile="$OUT/app.bundle.js" --log-level=warning
cp web/index.html web/app.css web/icon.png web/viewer.html web/viewer.bundle.js "$OUT/"
echo "Android UI built into $OUT"
