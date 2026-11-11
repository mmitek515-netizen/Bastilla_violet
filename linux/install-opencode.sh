#!/usr/bin/env bash
set -euo pipefail
# Run as the Debian host operator. Review official OpenCode installer before executing it.
if ! command -v opencode >/dev/null 2>&1; then
  echo 'OpenCode is not installed. Install it using the current official instructions: https://opencode.ai/docs'
  exit 1
fi
printf 'OpenCode version: '; opencode --version
cat <<'MSG'
NEXT STEPS:
  1. As the SAME Linux account that will run OpenCode, execute:
     opencode auth login openai
     Choose 'Sign in with ChatGPT' and finish the browser/device-code flow.
  2. Run OpenCode privately: 
     OPENCODE_SERVER_PASSWORD='generate-a-long-random-secret' opencode serve --hostname 127.0.0.1 --port 4096
  3. Configure BastillaOS backend OPENCODE_SERVER_PASSWORD to the SAME secret.
  4. For access from phone, serve BastillaOS using an authenticated HTTPS reverse proxy or Tailscale.
  Never publish OpenCode port 4096 to the public Internet.
MSG
