#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${DESKTOP_DIR}/marshall-os.desktop"
ICON_FILE="${APP_DIR}/public/icons/app-icon-512.png"

mkdir -p "${DESKTOP_DIR}"
chmod +x "${APP_DIR}/scripts/chromebook-launch.sh"

cat >"${DESKTOP_FILE}" <<DESKTOP
[Desktop Entry]
Type=Application
Name=MARshall OS
Comment=Start MARshall OS locally and open the app
Exec=${APP_DIR}/scripts/chromebook-launch.sh
Icon=${ICON_FILE}
Terminal=false
Categories=Office;Utility;
StartupNotify=true
DESKTOP

chmod +x "${DESKTOP_FILE}"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || true
fi

printf 'Installed MARshall OS launcher. Open it from the Chromebook launcher.\n'
