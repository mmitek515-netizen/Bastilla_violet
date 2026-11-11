# Bastilla OS MCP — tylko Google AI Studio

W tym wariancie nie używamy Codespaces ani lokalnego terminala. Google AI Studio
Build zapewnia backend Node.js i możliwość importu kodu z GitHub, natomiast
publikacja full-stack aplikacji udostępnia zarządzany adres HTTPS na Cloud Run.

**Uwaga:** podgląd AI Studio to nie jest stabilny, uwierzytelniony serwer MCP.
Wtyczka ChatGPT `bastilla-os-mcp` może przechowywać tymczasowy URL podglądu,
który nie potwierdza uruchomienia usługi. Wtyczka nie instaluje Bastilla OS,
Debiana 13 ani Ollamy.

## Gotowy odizolowany gateway dla AI Studio / Cloud Run

Od 10.11.2026 w `main` jest osobny punkt wejściowy:
`scripts/ai-studio-mcp.mjs`; komenda startowa:

```bash
npm run mcp:ai-studio
```

Gateway używa `process.env.PORT` (domyślnie 8080), nasłuchuje
na `0.0.0.0`, ma tylko `POST /mcp` i `GET /healthz`, a nie
uruchamia głównego `server.ts` z uprzywilejowanymi trasami.

**Nie nadpisuj tym poleceniem głównej aplikacji GUI Bastilla OS.**
W AI Studio utwórz osobną aplikację/usługę o nazwie `Bastilla MCP Gateway`,
zaimportuj pliki z `main` i skonfiguruj jej komendę startową jako
`npm run mcp:ai-studio`. Główny projekt GUI pozostaw oddzielnie.

W panelu Secrets aplikacji Gateway dodaj `SVL_MCP_TOKEN` —
losowy sekret o długości co najmniej 32 znaków. W odróżnieniu od lokalnego
Codespaces, Cloud Run wymaga jawnie ustawionego sekretu:
gateway **odmówi startu** bez poprawnego `SVL_MCP_TOKEN`.
Token pozostaje serwerowy; nie wpisuj go do promptów, publicznego repozytorium
ani do `mcp.json` w pluginie. Uwierzytelnianie z ChatGPT wymaga
skonfigurowanego zgodnego klienta lub bramy OAuth; samo wskazanie URL
z pluginu nie przesyła Bearer tokenu.

Taki gateway potwierdzi własne działanie, ale gdy nie ma rzeczywistej lokalnej
usługi SVL na porcie 3000, `svl_system_status` uczciwie pokaże
`svlReachable=false`. Bez dostępnej w tym samym kontenerze Ollamy,
`svl_ollama_status` pokaże `reachable=false`. Profile agentów będą
`unverified`, a nie fikcyjnie `online`.

Testy lokalne i CI:
`node --test tests/mcp-bridge.test.mjs tests/ai-studio-mcp.test.mjs`.
Testy mock nie dowodzą dostępności opublikowanej usługi.

## Zasada architektoniczna

1. Zaimportuj `mmitek515-netizen/SVL_System` z GitHub do aplikacji w Build.
   Jeśli już jest połączona z repozytorium, użyj `Sync/Pull` z `main`.
2. Backend AI Studio musi obsługiwać MCP **na tym samym porcie co aplikacja**,
   pod `POST /mcp`, ponieważ publikowana usługa Cloud Run zwykle udostępnia
   jeden HTTP listener (`process.env.PORT`). Samo `npm run mcp` uruchamiające
   osobny port 3100 nie gwarantuje, że usługa będzie dostępna publicznie.
3. Adaptuj wyłącznie odczytowe narzędzia z `scripts/mcp-bridge.mjs`:
   `svl_bridge_status`, `svl_agents`, `svl_ai_status`,
   `svl_system_status` i `svl_ollama_status`. Nie rejestruj poleceń shell,
   roota, GitHub write ani modyfikacji kernela.
4. Backend MCP i ewentualna diagnostyka SVL powinny korzystać z jednej instancji
   runtime; wywołania do `localhost:3000` w chmurze nie działają, gdy ten serwer
   nie został faktycznie uruchomiony.
5. Do publicznego MCP wymagane jest uwierzytelnianie zgodne z klientem
   ChatGPT (np. wspierany OAuth albo zaufana brama). Nie publikuj tokenów.
   Bez działającego uwierzytelniania **nie publikuj MCP**.
6. Nie publikuj całego `server.ts` z uprzywilejowanymi operacjami systemowymi
   jako publicznego, anonimowego API. Wystaw tylko wydzielony, uwierzytelniony
   gateway diagnostyczny lub wyłącz publiczny dostęp do pozostałych tras.
7. Lokalny `127.0.0.1:11434` w Cloud Run oznacza **chmurowy kontener**,
   a nie komputer użytkownika. Dopóki nie ma osiągalnego backendu Ollamy,
   `svl_ollama_status` musi zwracać `reachable: false`, a nie status online.
8. Czterej agenci Alex, Aria, Astyria i Aurelius istnieją w repo jako
   skonfigurowane profile. Nie oznaczaj ich jako procesów online bez
   uwierzytelnionego heartbeat/callback ze skuteccznie działającego procesu.

## Polecenie do wklejenia w AI Studio

```text
W aplikacji Bastilla OS zaimportuj/synchronizuj najnowszą gałąź main repozytorium
mmitek515-netizen/SVL_System, zachowując istniejący interfejs i dane.

Jestem chwilowo tylko w Google AI Studio — bez Codespaces, bez hosta Debian
i bez lokalnego serwera Ollama. Przygotuj backend Node.js kompatybilny z
runtime AI Studio/Cloud Run. Zintegrowany gateway MCP ma działać na głównym
porcie HTTP (process.env.PORT), z endpointami POST /mcp i GET /healthz.
Korzystaj z protokołu Streamable HTTP i metod initialize, tools/list, tools/call.

Udostępnij wyłącznie read-only: svl_bridge_status, svl_agents,
svl_ai_status, svl_system_status, svl_ollama_status.
Dane stanu mają odróżniać: konfiguracja, dostępność API, aktywny proces,
załadowany model i uwierzytelniony heartbeat agentów.
Jeśli nie ma rzeczywistego procesu albo dostępu do zewnętrznego hosta,
wyświetl status offline/unverified. Nie symuluj wyników.

Dodaj obsługę bezpiecznego uwierzytelniania klientów ChatGPT do MCP
(np. OAuth lub chroniona brama HTTPS), trzymanego w Secrets po stronie serwera.
Bez uwierzytelniania nie wystawiaj endpointu MCP publicznie.
Nie udostępniaj zewnętrznie powłoki root, wykonywania dowolnych komend,
zarządzania kernelem ani niezabezpieczonych istniejących tras z server.ts.

Nie próbuj instalować Ollamy w podglądzie AI Studio. Jeśli nie ma
osobnego działającego hosta Ollama, pokaż offline.
Zachowaj frontend Bastilla OS i jego nawigację.

Uruchom testy endpointów oraz wyświetl wyniki initialize i tools/list.
Podaj ostateczny, opublikowany HTTPS URL /mcp dopiero po faktycznym
wdrożeniu i teście. Nie traktuj tymczasowego URL preview jako trwałego.
Jeśli wymagana jest publikacja lub konfiguracja OAuth, pokaż mi dokładnie
jaki krok w interfejsie wykonać zamiast wymyślać gotowe połączenie.
```

## Weryfikacja po zmianach

Przed połączeniem ChatGPT sprawdź na adresie usługi:

- `GET /healthz` — dane techniczne procesu, bez wrażliwych informacji;
- `POST /mcp` `initialize` — poprawna odpowiedź JSON-RPC;
- `POST /mcp` `tools/list` — pięć dozwolonych narzędzi;
- `tools/call svl_ollama_status` — rzeczywista odpowiedź lub jawny offline;
- `tools/call svl_agents` — profile, a nie sfabrykowana aktywność workerów.

Po publikacji aktualizuj URL w ustawieniach **prywatnej wtyczki ChatGPT**,
gdy odbiega od aktualnego i zweryfikowanego endpointu. Nie kopiuj
sekretów do plugin.json, mcp.json, GitHub lub publicznego kodu.

Źródła:
- https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- https://ai.google.dev/gemini-api/docs/aistudio-deploying
