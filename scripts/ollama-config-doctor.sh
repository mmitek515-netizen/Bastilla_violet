#!/usr/bin/env bash
# Restore ONLY old BastillaOS Ollama tuning. Never remove Ollama or downloaded models.
set -Eeuo pipefail

mode="${1:---status}"
dropin="/etc/systemd/system/ollama.service.d/bastillaos-tuning.conf"
local_tuning="${HOME}/.ollama/tuning.env"
base="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
base="${base%/}"

root() {
  if (( EUID == 0 )); then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else echo "Wymagany administrator (sudo) do cofnięcia ustawień." >&2; return 1
  fi
}

status() {
  echo "Ollama — diagnostyka ustawień BastillaOS (bez modyfikacji)"
  if [[ -e "$dropin" ]]; then
    echo "UWAGA: historyczny drop-in systemd istnieje: $dropin"
    if [[ -r "$dropin" ]]; then
      grep -E 'Environment="OLLAMA_(KEEP_ALIVE|NUM_PARALLEL|MAX_LOADED_MODELS|CONTEXT_LENGTH|FLASH_ATTENTION|KV_CACHE_TYPE)=' "$dropin" || true
    fi
  else
    echo "Nie wykryto historycznego drop-in systemd BastillaOS."
  fi
  if [[ -e "$local_tuning" ]]; then
    echo "Historyczne ustawienia trybu bez systemd: $local_tuning"
    grep -E '^OLLAMA_(KEEP_ALIVE|NUM_PARALLEL|MAX_LOADED_MODELS|CONTEXT_LENGTH|FLASH_ATTENTION|KV_CACHE_TYPE)=' "$local_tuning" || true
  fi
  if [[ -r /etc/bastillaos/system.env ]]; then
    echo "Ustawienia czatu w /etc/bastillaos/system.env (bez sekretów):"
    grep -E '^(OLLAMA_MODEL|OLLAMA_BASE_URL|OLLAMA_KEEP_ALIVE|OLLAMA_NUM_CTX|OLLAMA_NUM_PREDICT|LLM_PROVIDERS)=' /etc/bastillaos/system.env || true
  fi
  if command -v ollama >/dev/null 2>&1; then
    echo "Zainstalowane modele:"
    ollama list || true
  else
    echo "Polecenie ollama nie jest dostępne w PATH."
  fi
  if command -v curl >/dev/null 2>&1; then
    echo "Sprawdzam API: $base/api/version"
    curl -fsS --max-time 5 "$base/api/version" || echo "Brak połączenia HTTP z Ollamą pod skonfigurowanym adresem."
    echo
  fi
  echo "Uwaga: 127.0.0.1 na innym serwerze/AI Studio nie jest adresem Ollamy Twojego komputera."
}

restore() {
  echo "Wycofuję tylko konfigurację strojenia utworzoną przez stary BastillaOS."
  local changed=0 backup
  backup="$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -f "$dropin" ]]; then
    root mv -- "$dropin" "${dropin}.backup-${backup}"
    changed=1
    echo "Zachowano backup: ${dropin}.backup-${backup}"
    if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
      root systemctl daemon-reload
      if systemctl is-active --quiet ollama; then
        root systemctl restart ollama
        echo "Usługa Ollama uruchomiona ponownie z pozostałą konfiguracją systemu."
      fi
    fi
  fi
  if [[ -f "$local_tuning" ]]; then
    mv -- "$local_tuning" "${local_tuning}.backup-${backup}"
    changed=1
    echo "Zachowano backup: ${local_tuning}.backup-${backup}"
    echo "Jeżeli Ollama działa jako ręczny proces 'ollama serve', uruchom ją ponownie świadomie, by usunąć stare zmienne z procesu."
  fi
  if (( changed == 0 )); then
    echo "Nie znaleziono historycznych plików strojenia. Nic nie zmieniono."
  fi
  echo "Nie usunięto żadnego modelu, katalogu ~/.ollama/models ani klucza API."
  echo "Sprawdź także wartości OLLAMA_* w .env/.env.local lub /etc/bastillaos/system.env: istniejące ustawienia mają pierwszeństwo przed nowymi wartościami domyślnymi w kodzie."
  status
}

case "$mode" in
  --status) status ;;
  --restore-bastilla-tuning) restore ;;
  *)
    echo "Użycie: bash scripts/ollama-config-doctor.sh [--status|--restore-bastilla-tuning]" >&2
    exit 2
    ;;
esac
