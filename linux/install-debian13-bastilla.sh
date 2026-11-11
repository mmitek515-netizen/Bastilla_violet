#!/usr/bin/env bash
# Bastilla OS / SVL_System — Debian 13 (Trixie) Full Host Installer
set -euo pipefail

echo "=== Instalator Bastilla OS / SVL_System dla Debian 13 (Trixie) ==="

if [ "$(id -u)" -ne 0 ]; then
  echo "Uruchom instalator jako root (sudo bash linux/install-debian13-bastilla.sh)" >&2
  exit 1
fi

apt-get update
apt-get install -y curl git python3 python3-pip ca-certificates gnupg sudo systemd procps

# 1. Instalacja GitHub CLI (gh)
if ! command -v gh >/dev/null 2>&1; then
  apt-get install -y gh || true
fi

# 2. Instalacja oficjalnego OpenAI Codex CLI (@openai/codex)
if command -v npm >/dev/null 2>&1; then
  npm install -g @openai/codex@latest
  echo "[OK] Zainstalowano oficjalny OpenAI Codex CLI: $(codex --version)"
  echo "Aby zalogować konto ChatGPT bez klucza API, wykonaj: codex login --device-auth"
fi

# 3. Instalacja Ollama i weryfikacja zasobów dla modelu 14B Vision
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
systemctl enable --now ollama || true

TOTAL_RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
echo "Wykryty RAM: ${TOTAL_RAM_MB} MB"
if [ "${TOTAL_RAM_MB}" -ge 12000 ]; then
  echo "Pobieranie modelu Vision (qwen2.5-vl:14b lub llama3.2-vision:11b)..."
  ollama pull qwen2.5-vl:14b || ollama pull llama3.2-vision:11b || true
fi

# 4. Konfiguracja usługi systemd linux-sync-agent i katalogów trwałych
useradd --system --no-create-home --shell /usr/sbin/nologin bastilla-sync 2>/dev/null || true
install -d -m 700 /etc/bastillaos /var/lib/bastillaos
install -Dm644 linux/linux-sync-agent.py /opt/bastillaos/linux-sync-agent.py
install -Dm644 linux/systemd/bastilla-linux-sync.service /etc/systemd/system/bastilla-linux-sync.service

if [ ! -f /etc/bastillaos/linux-sync.env ]; then
  TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
  umask 077
  cat > /etc/bastillaos/linux-sync.env <<EOF
SVL_BACKEND_URL=https://localhost:3000
SVL_LINUX_SYNC_TOKEN=${TOKEN}
SVL_SYNC_INTERVAL=15
EOF
fi

systemctl daemon-reload
systemctl enable bastilla-linux-sync.service || true
echo "=== Instalacja Debian 13 dla Bastilla OS zakończona ==="
