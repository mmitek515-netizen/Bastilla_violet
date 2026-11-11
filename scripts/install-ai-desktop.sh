#!/usr/bin/env bash
# Explicit install on a trusted Debian 13 machine. No Kali repositories.
set -Eeuo pipefail
mode="${1:---verify}"
packages=(xvfb xfce4 xfce4-terminal x11vnc novnc websockify dbus-x11)
case "$mode" in
 --verify)
   for binary in Xvfb startxfce4 x11vnc websockify dbus-run-session; do
     if command -v "$binary" >/dev/null 2>&1; then printf 'INSTALLED %s\n' "$binary"
     else printf 'MISSING %s\n' "$binary"; fi
   done
   if [[ -f /usr/share/novnc/vnc.html ]]; then echo 'INSTALLED noVNC'; else echo 'MISSING noVNC'; fi
   ;;
 --dry-run) printf 'Would install from existing Debian APT repositories: %s\n' "${packages[*]}" ;;
 --install)
   [[ "$(id -u)" == '0' ]] || { echo 'Run --install using sudo on Debian 13.' >&2; exit 1; }
   [[ -r /etc/os-release ]] || exit 1
   # shellcheck disable=SC1091
   source /etc/os-release
   [[ "${ID:-}" == 'debian' && "${VERSION_ID%%.*}" == '13' ]] || {
      echo 'Only Debian 13 is supported.' >&2; exit 1;
   }
   if grep -Eiq 'kali-rolling|http.kali.org' /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list 2>/dev/null; then
      echo 'Kali sources detected: refusing mixed repositories.' >&2; exit 1
   fi
   export DEBIAN_FRONTEND=noninteractive
   apt-get update
   apt-get install -y --no-install-recommends "${packages[@]}"
   echo 'Installed. As regular user: x11vnc -storepasswd ~/.vnc/passwd'
   echo 'Then: bash scripts/start-ai-desktop.sh'
   ;;
 *) echo 'Usage: bash scripts/install-ai-desktop.sh [--verify|--dry-run|--install]' >&2; exit 2 ;;
esac
