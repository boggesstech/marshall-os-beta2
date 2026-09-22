#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/marshall-os.desktop"

mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=MARshall OS
Comment=Start MARshall OS locally
Exec=$APP_DIR/scripts/chromebook-launch.sh
Icon=$APP_DIR/public/icons/app-icon-512.png
Terminal=false
Categories=Office;Utility;
StartupNotify=true
EOF

chmod +x "$APP_DIR/scripts/chromebook-launch.sh"
chmod +x "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

echo "Installed MARshall OS launcher."
echo "Open it from the Chromebook launcher under Linux apps."
