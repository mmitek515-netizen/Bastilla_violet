#!/usr/bin/env bash
# Keep the authenticated, read-only MCP bridge alive independently of the SVL app.
# The bridge creates a random secret in the ignored local .env on first start.
set -u
cd "$(dirname "$0")/.." || exit 1
exec 9>/tmp/svl-mcp-keepalive.lock
flock -n 9 || exit 0
while true; do
  node scripts/mcp-bridge.mjs >> /tmp/svl-mcp.log 2>&1
  echo "[mcp-keepalive] bridge exited ($(date -Is)); retrying in 5 s" >> /tmp/svl-mcp.log
  sleep 5
done
