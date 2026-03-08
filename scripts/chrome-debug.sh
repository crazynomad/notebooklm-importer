#!/usr/bin/env bash
# Launch Chrome with CDP remote debugging port enabled.
# Usage:
#   bash scripts/chrome-debug.sh              # default Profile 1, port 9222
#   bash scripts/chrome-debug.sh "Profile 4"  # specify profile
#   bash scripts/chrome-debug.sh "" 9333       # default profile, custom port
set -euo pipefail

PROFILE="${1:-Profile 1}"
PORT="${2:-9222}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_DATA="$HOME/Library/Application Support/Google/Chrome"
DEBUG_DIR="$HOME/Chrome-Debug-Profile"

# ── 1. Quit existing Chrome ──
if pgrep -q "Google Chrome"; then
  echo "⏳ Quitting Chrome..."
  osascript -e 'tell application "Google Chrome" to quit' 2>/dev/null || true
  # Wait up to 10s for graceful exit
  for i in $(seq 1 10); do
    pgrep -q "Google Chrome" || break
    sleep 1
  done
  if pgrep -q "Google Chrome"; then
    echo "⚠️  Chrome didn't quit gracefully, force killing..."
    pkill -9 "Google Chrome" 2>/dev/null || true
    sleep 1
  fi
  echo "✅ Chrome exited"
else
  echo "✅ Chrome not running"
fi

# ── 2. Sync profile to debug directory ──
echo "📋 Syncing profile '$PROFILE' → $DEBUG_DIR"
mkdir -p "$DEBUG_DIR/$PROFILE"

# Root-level config
for f in "Local State" "First Run"; do
  [ -f "$CHROME_DATA/$f" ] && cp "$CHROME_DATA/$f" "$DEBUG_DIR/$f" 2>/dev/null || true
done

# Profile-level data (login state, cookies, preferences, extensions)
PROFILE_FILES=(
  Cookies "Login Data" Preferences "Secure Preferences" "Web Data"
  Bookmarks History "Extension Cookies" "Network Action Predictor"
  "Affiliation Database" "Favicons" "Top Sites"
)
for f in "${PROFILE_FILES[@]}"; do
  [ -f "$CHROME_DATA/$PROFILE/$f" ] && cp "$CHROME_DATA/$PROFILE/$f" "$DEBUG_DIR/$PROFILE/$f" 2>/dev/null || true
done

# Sync extensions (incremental)
if [ -d "$CHROME_DATA/$PROFILE/Extensions" ]; then
  rsync -a --delete "$CHROME_DATA/$PROFILE/Extensions/" "$DEBUG_DIR/$PROFILE/Extensions/" 2>/dev/null || \
    cp -R "$CHROME_DATA/$PROFILE/Extensions" "$DEBUG_DIR/$PROFILE/" 2>/dev/null || true
fi

echo "   Size: $(du -sh "$DEBUG_DIR" 2>/dev/null | cut -f1)"

# ── 3. Launch Chrome with debugging ──
echo "🚀 Launching Chrome (port $PORT, profile '$PROFILE')..."
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$DEBUG_DIR" \
  --profile-directory="$PROFILE" \
  &>/dev/null &
disown

# ── 4. Wait for CDP endpoint ──
echo -n "⏳ Waiting for CDP..."
for i in $(seq 1 15); do
  if curl -s "http://127.0.0.1:$PORT/json/version" &>/dev/null; then
    echo " ready!"
    echo ""
    echo "🔗 CDP endpoint: http://127.0.0.1:$PORT"
    echo "📄 Tabs: http://127.0.0.1:$PORT/json/list"
    VERSION=$(curl -s "http://127.0.0.1:$PORT/json/version" | python3 -c "import sys,json; print(json.load(sys.stdin)['Browser'])" 2>/dev/null || echo "?")
    echo "🌐 Browser: $VERSION"
    echo ""
    echo "Connect with Playwright:"
    echo "  const browser = await chromium.connectOverCDP('http://127.0.0.1:$PORT')"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " timeout!"
echo "❌ CDP endpoint not available. Check /tmp/chrome-debug.log"
"$CHROME" --version 2>/dev/null
exit 1
