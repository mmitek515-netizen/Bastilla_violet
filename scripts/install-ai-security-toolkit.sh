#!/usr/bin/env bash
# Bastilla OS: safe install of Kali-style AI diagnostics on Debian 13.
# Only packages from the machine's existing Debian APT sources are used.
set -euo pipefail

CORE=(nmap tcpdump lynis yara strace jq ripgrep iproute2 lsof debsums)
FORENSICS=(binwalk libimage-exiftool-perl)
mode="${1:---verify}"
tier="${2:---core}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install-ai-security-toolkit.sh --verify
  sudo bash scripts/install-ai-security-toolkit.sh --install [--core|--forensics]
  bash scripts/install-ai-security-toolkit.sh --dry-run [--core|--forensics]

Never add Kali rolling APT repositories to Debian 13.
Installation changes the real Linux host and is NEVER performed by a browser.
The optional --forensics tier includes the core packages.
USAGE
}

case "$mode" in
  --verify|--install|--dry-run) ;;
  *) usage; exit 2 ;;
esac
case "$tier" in
  --core|--forensics) ;;
  *) usage; exit 2 ;;
esac

if [[ "$mode" == "--verify" ]]; then
  for bin in nmap tcpdump lynis yara strace jq rg ip ss lsof debsums binwalk exiftool; do
    if command -v "$bin" >/dev/null 2>&1; then
      printf 'INSTALLED %-12s %s\n' "$bin" "$(command -v "$bin")"
    else
      printf 'MISSING   %s\n' "$bin"
    fi
  done
  exit 0
fi

packages=("${CORE[@]}")
if [[ "$tier" == "--forensics" ]]; then
  packages+=("${FORENSICS[@]}")
fi

printf 'Debian packages: %s\n' "${packages[*]}"
if [[ "$mode" == "--dry-run" ]]; then
  printf 'Would run: apt-get update && apt-get install --no-install-recommends --yes'
  printf ' %q' "${packages[@]}"
  printf '\n'
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'ERROR: --install requires explicit sudo/root on the Debian host.\n' >&2
  exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  printf 'ERROR: Cannot verify Debian host.\n' >&2
  exit 1
fi
# shellcheck source=/dev/null
source /etc/os-release
if [[ "${ID:-}" != 'debian' || "${VERSION_ID%%.*}" != '13' ]]; then
  printf 'ERROR: This profile is for Debian 13 only; detected %s %s.\n' "${ID:-unknown}" "${VERSION_ID:-unknown}" >&2
  exit 1
fi

# Refuse mixed Kali repositories; mixing Debian/Kali packages can break the OS.
if grep -Eiq 'kali-rolling|http[[:space:]]*:[[:space:]]*//http.kali.org|http.kali.org' \
    /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null; then
  printf 'ERROR: Kali repository detected in APT sources. Resolve this before installing.\n' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --no-install-recommends --yes "${packages[@]}"
printf '\nInstalled Debian security toolbox. Verify with:\n'
printf 'bash scripts/install-ai-security-toolkit.sh --verify\n'
printf 'Note: no Kali metapackage, root shell endpoint or attack automation was installed.\n'
