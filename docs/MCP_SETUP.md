# Bastilla OS MCP — połączenie i diagnostyka

Domyślny serwer Bastilla MCP to `scripts/mcp-bridge.mjs` (`npm run mcp`), a NIE osobna
implementacja `src/mcp/chatgptMcpServer.ts`. Serwer działa na porcie 3100,
aplikacja SVL na 3000. MCP udostępnia tylko odczyt, bez shell, root, zapisu plików
ani operacji GitHub write.

## Narzędzia (rzeczywista lista w tools/list)

- `svl_bridge_status` — status uruchomionego mostu.
- `svl_agents` — cztery skonfigurowane profile, **nie** potwierdzenie działających workerów.
- `svl_ai_status` — status konfiguracji modelu z `/api/ai/status`; nie dowodzi, że Ollama odpowiada.
- `svl_system_status` — faktyczna dostępność lokalnej aplikacji i wybrane dane z infrastruktury.
- `svl_ollama_status` — bezpośredni odczyt `/api/version`, `/api/tags` i `/api/ps` z lokalnej Ollamy.
  Jeśli Ollama nie działa, `reachable: false`; brak modeli w pamięci nie oznacza awarii serwera.

## Uruchomienie w GitHub Codespaces

Po aktualizacji repozytorium przebuduj/restartuj Codespace, aby zastosować nową
konfigurację `.devcontainer/devcontainer.json`. Nowy kontener automatycznie uruchamia
`npm ci`, następnie opiekuna aplikacji i oddzielnego opiekuna MCP. Każdy z nich
automatycznie wznawia proces po awarii. Logi lokalne: `/tmp/svl.log` i
`/tmp/svl-mcp.log`.

Do ręcznego uruchomienia w istniejącym Codespace:

```bash
npm ci
npm run dev        # terminal 1; nie potrzebny, jeśli już działa keep-alive
npm run mcp        # terminal 2; nie potrzebny, jeśli już działa keep-mcp-alive
```

Jeśli w środowisku nie ustawiono `SVL_MCP_TOKEN`, most generuje kryptograficznie
losowy token i zapisuje go do lokalnego, ignorowanego przez Git pliku `.env`
(z uprawnieniami 0600). Jeżeli ustawiono sekret Codespaces `SVL_MCP_TOKEN`,
będzie on użyty zamiast generowania nowego. Zbyt krótki, jawnie podany token
jest odrzucany; nie umieszczaj go w Git, czacie ani logach.

### Kontrola lokalna

```bash
# Pobierz token z lokalnego pliku do zmiennej tylko w bieżącej powłoce,
# jeżeli nie pochodzi już z Codespaces Secrets.
if [ -z "${SVL_MCP_TOKEN:-}" ]; then
  export SVL_MCP_TOKEN="$(node -e "require('dotenv').config(); process.stdout.write(process.env.SVL_MCP_TOKEN || '')")"
fi

curl -fsS http://127.0.0.1:3100/healthz -H "Authorization: Bearer $SVL_MCP_TOKEN"
curl -fsS http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer $SVL_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
curl -fsS http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer $SVL_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Dodatkowe kontrole: `curl -fsS http://127.0.0.1:3000/api/ai/status`
oraz `curl -fsS http://127.0.0.1:11434/api/version` (tylko na
zaufanym lokalnym hoście).

## Połączenie z ChatGPT

W zakładce **Ports** sprawdź faktyczny adres portu 3100. Jeżeli dostęp do
Codespaces jest włączony, adres ma zwykle format
`https://<codespace>-3100.app.github.dev/mcp`. To wzór, NIE aktywny adres.
Adres repozytorium, adres podglądu Google AI Studio i adres z portu 3000 nie są
zamiennikami MCP; używaj poprawnego, aktualnego adresu usługi.

**Port 3100 pozostaje Private domyślnie.** ChatGPT nie może połączyć się
bezpośrednio z prywatnym portem Codespaces, ponieważ dostęp wymaga dodatkowej
autoryzacji GitHub. Do połączenia użyj obsługiwanego **Secure MCP Tunnel**
albo prawidłowo uwierzytelnionej bramy HTTPS z OAuth. Statycznego tokenu
`SVL_MCP_TOKEN` nie należy zastępować publicznym, anonimowym dostępem.
Nie publikuj portu 3000: SVL może wykonywać uprzywilejowane działania.

W ChatGPT: **Plugins → + → Add custom MCP server**. Podaj rzeczywisty HTTPS
endpoint lub skonfigurowany tunel i uwierzytelnianie, utwórz plugin, a następnie
uruchom narzędzia `svl_bridge_status`, `svl_system_status`,
`svl_ollama_status`, `svl_agents`. Instalacja samego pluginu
nie uruchamia Codespaces ani lokalnej Ollamy.

## Typowe błędy

| Objaw | Znaczenie / działanie |
|---|---|
| HTTP 404 | Zła domena/ścieżka; sprawdź rzeczywisty adres portu 3100 i `/mcp`. |
| HTTP 401 | Brak/błędny Bearer token lub dodatkowe uwierzytelnianie Codespaces. |
| HTTP 403 | Niedozwolony nagłówek Origin. |
| HTTP 405 na GET /mcp | Oczekiwane: ten serwer obsługuje POST /mcp. |
| MCP działa, SVL niedostępne | Sprawdź port 3000 i `/tmp/svl.log`. |
| MCP działa, Ollama unreachable | Sprawdź `ollama serve`, port 11434 i `ollama list`. |
| Agenci `unverified` | W repo są profile agentów, ale brak potwierdzenia aktywnych workerów. |

Po restarcie Codespaces sprawdź `tail -n 40 /tmp/svl-mcp.log`, `tail -n 40 /tmp/svl.log`
i odpowiedzi lokalnych endpointów. Kiedy Codespaces jest zatrzymany, jego
serwer MCP nie odpowiada: commit GitHub ani plugin nie gwarantują pracy 24/7.

Dokumentacja: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
oraz https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt .
