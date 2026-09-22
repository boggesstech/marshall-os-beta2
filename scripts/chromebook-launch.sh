#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_URL="http://localhost:3000"
LOG_DIR="$APP_DIR/.logs"
LOG_FILE="$LOG_DIR/chromebook-server.log"
LAUNCH_LOG="$LOG_DIR/chromebook-launch.log"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"
exec >>"$LAUNCH_LOG" 2>&1

echo ""
echo "[$(date)] Launch requested"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. Install Node.js/npm in Chromebook Linux first."
  exit 1
fi

is_running() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$APP_URL" >/dev/null 2>&1
    return
  fi

  node -e "
    require('http').get('$APP_URL', function(res) {
      process.exit(res.statusCode && res.statusCode < 500 ? 0 : 1);
    }).on('error', function() {
      process.exit(1);
    });
  " >/dev/null 2>&1
}

if ! is_running; then
  echo "Starting MARshall OS server..."
  if [ ! -d "$APP_DIR/.next" ]; then
    echo "No production build found. Building first..."
    npm run build
  fi

  nohup npm run start >"$LOG_FILE" 2>&1 &

  for _ in {1..30}; do
    if is_running; then
      echo "Server ready at $APP_URL"
      break
    fi
    sleep 1
  done
fi

if command -v xdg-open >/dev/null 2>&1; then
  echo "Opening $APP_URL"
  xdg-open "$APP_URL" >/dev/null 2>&1 &
else
  echo "MARshall OS is running at $APP_URL"
fi
