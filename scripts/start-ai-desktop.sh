#!/usr/bin/env bash
# Start a genuine Debian desktop session without claiming host-root access.
# VNC and noVNC listen on localhost ONLY. Use SSH tunneling/private forwarding.
set -Eeuo pipefail
export DISPLAY="${SVL_DESKTOP_DISPLAY:-:99}"
web_port="${SVL_DESKTOP_WEB_PORT:-6080}"
vnc_port="${SVL_DESKTOP_VNC_PORT:-5901}"
pw_file="${SVL_DESKTOP_VNC_PASSWORD_FILE:-$HOME/.vnc/passwd}"

for tool in Xvfb x11vnc websockify startxfce4 dbus-run-session; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Brak pakietu zapewniającego: $tool" >&2
    exit 1
  fi
done

if [[ ! -r "$pw_file" ]]; then
  echo "Brak hasła VNC. Uruchom: mkdir -p ~/.vnc && chmod 700 ~/.vnc && x11vnc -storepasswd ~/.vnc/passwd && chmod 600 ~/.vnc/passwd" >&2
  exit 1
fi
if [[ "$DISPLAY" != ':99' ]]; then
  echo "Z powodów bezpieczeństwa konfiguracja wspiera wyłącznie DISPLAY=:99" >&2
  exit 1
fi
for port in "$web_port" "$vnc_port"; do
  [[ "$port" =~ ^[0-9]{1,5}$ ]] && (( port > 1024 && port < 65536 )) || {
    echo "Nieprawidłowy port: $port" >&2; exit 1;
  }
done
[[ "$web_port" != "$vnc_port" ]] || { echo "Porty muszą być różne" >&2; exit 1; }

pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
pids+=("$!")
for _ in {1..40}; do
  [[ -S /tmp/.X11-unix/X99 ]] && break
  sleep 0.2
done
[[ -S /tmp/.X11-unix/X99 ]] || { echo "Xvfb nie uruchomił się" >&2; exit 1; }

dbus-run-session -- startxfce4 &
pids+=("$!")
x11vnc -display :99 -localhost -rfbauth "$pw_file" -rfbport "$vnc_port" -forever -shared -noxdamage -quiet &
pids+=("$!")
websockify --web=/usr/share/novnc "127.0.0.1:$web_port" "127.0.0.1:$vnc_port" &
pids+=("$!")

echo "AI Desktop Nexus: próba uruchomienia rzeczywistej sesji na DISPLAY=:99"
echo "noVNC tylko lokalnie: http://127.0.0.1:$web_port/vnc.html"
echo "Do dostępu zdalnego użyj prywatnego tunelu i hasła VNC."
# End the session if ANY critical process exits.
wait -n "${pids[@]}"
echo "Usługa pulpitu zakończyła się; wyłączam pozostałe procesy." >&2
exit 1
