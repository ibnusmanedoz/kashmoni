#!/usr/bin/env bash
# Starts the Kash Moni AI workspace helper. Works on Zorin/Ubuntu and Termux.
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is not installed. On Zorin: sudo apt install python3   On Termux: pkg install python"
  exit 1
fi
exec python3 kashmoni_helper.py "$@"
