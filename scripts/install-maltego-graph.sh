#!/usr/bin/env bash
# Maltego Graph Desktop for BastillaOS/Debian 13.
# Uses a local .deb obtained by the operator from https://www.maltego.com/downloads/
# Never mixes Kali APT sources into Debian and never auto-launches Maltego as root.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install-maltego-graph.sh --verify
  bash scripts/install-maltego-graph.sh --dry-run "/path/to/official-Maltego.deb"
  sudo bash scripts/install-maltego-graph.sh --install "/path/to/official-Maltego.deb"

Download the Linux .deb from https://www.maltego.com/downloads/
Verify the official source/checksum before installation.
Maltego is a licensed GUI product. Activate with your own Maltego ID as a normal user.
No background/silent activation, transform execution or Kali sources are installed.
EOF
}

mode="${1:---verify}"
case "$mode" in --verify|--dry-run|--install) ;; *) usage; exit 2;; esac

if [[ "$mode" == --verify ]]; then
  if command -v maltego >/dev/null 2>&1; then
    printf 'MALTEGO_BINARY=present\nPATH=%s\n' "$(command -v maltego)"
  else
    printf 'MALTEGO_BINARY=absent\n'
  fi
  if command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status} ${Version}\n' maltego 2>/dev/null; then
    : # Package info was printed by dpkg-query.
  else
    printf 'MALTEGO_DPKG=not-confirmed\n'
  fi
  if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    printf 'GUI_ENV=present (not proof of working GUI)\n'
  else
    printf 'GUI_ENV=absent (run desktop app in a graphical user session)\n'
  fi
  exit 0
fi

if [[ "$#" -ne 2 ]]; then usage; exit 2; fi
archive="$2"
if [[ "$archive" != *.deb || ! -f "$archive" ]]; then
  printf 'ERROR: Provide an existing official .deb file.\n' >&2
  exit 2
fi
archive="$(realpath -- "$archive")"
if ! command -v dpkg-deb >/dev/null 2>&1; then
  printf 'ERROR: dpkg-deb not available on this system.\n' >&2
  exit 2
fi
package="$(dpkg-deb --field "$archive" Package)"
if [[ "${package,,}" != maltego ]]; then
  printf 'ERROR: The .deb package identity is not maltego (got %s).\n' "$package" >&2
  exit 2
fi
printf 'Package: %s\nVersion: %s\nArchive: %s\n' "$package" \
  "$(dpkg-deb --field "$archive" Version)" "$archive"

if [[ "$mode" == --dry-run ]]; then
  printf 'Would install after your review: apt-get install -- %q\n' "$archive"
  exit 0
fi

if [[ "$(id -u)" != 0 ]]; then
  printf 'ERROR: Installation needs explicit sudo on the Debian host.\n' >&2
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != debian || "${VERSION_ID%%.*}" != 13 ]]; then
  printf 'ERROR: This script targets Debian 13. Detected %s %s.\n' "${ID:-unknown}" "${VERSION_ID:-unknown}" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get install -- "$archive"
printf '\nInstallation finished. Launch "maltego" as your normal KDE user (not via sudo).\n'
printf 'First launch requires license / Maltego ID activation by the account owner.\n'
