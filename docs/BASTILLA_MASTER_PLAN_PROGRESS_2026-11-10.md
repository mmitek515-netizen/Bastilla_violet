# Bastilla OS / SVL_System — pełny plan, wymagania i procent ukończenia

**Stan na 2026-11-10, po wdrożeniach do `main` (odniesienie `768b966f`).** Repozytorium: `mmitek515-netizen/SVL_System`, jedyna gałąź robocza wskazana przez właściciela: `main`. Obowiązuje zasada: **najpierw GUI/design, potem rozbudowa i autonomiczne ulepszanie przez AI**. Hasło otwarcia: **Enter hyperspace**.

## Sposób oceny

Szacunki procentowe odzwierciedlają **stopień realizacji wymagań w aktualnym drzewie repozytorium**, oceniony na podstawie kodu, testów i udokumentowanych ograniczeń. Nie są automatycznym pomiarem, nie oznaczają procentu ukończonych zadań GitHub i **nie są potwierdzeniem działania na hoście**. Wagi sumują się do 100; wartość globalna to suma `waga × procent / 100`, zaokrąglona do liczby całkowitej. Brak dowodu integracji runtime obniża ocenę.

| Obszar | Waga | Realizacja, szacunek | Stan i brakujące kryteria |
| --- | ---: | ---: | --- |
| GUI, design, nawigacja, gesty, Android | 16% | 52% | Istnieje GUI z katalogiem komponentów i reakcjami na zdarzenia; brakuje pełnych testów dotykowych i dopracowania gestów na telefonie |
| Główny czat dwustronny jak ChatGPT Work | 13% | 54% | Czat, historia, załączniki, wydarzenia SSE i odświeżanie; brak potwierdzonych inicjatyw niezależnych agentów 24/7 |
| Pełna biblioteka interaktywnych bloków wiadomości | 10% | 75% | Renderer 80 unikalnych typów w 5 kategoriach, katalog i testy; część działań pozostaje lokalna lub wymaga wiarygodnych integracji API |
| Awatary operatora i agentów | 3% | 65% | Plik, HTTPS, render z promptu w kodzie; trwałość i generowanie na żywo niepotwierdzone |
| Debian 13 / KDE / ISO / pakiet systemowy | 10% | 40% | Live-build, pakiet, branding; brak testu instalacji ISO end-to-end na Debianie |
| Terminale i operacje systemowe | 8% | 40% | UI terminali i backend w kodzie; brak testu roota hosta w terminalach |
| Osobne konta Linux i administracja agentów | 5% | 60% | bastilla-agent-accounts tworzy konta, sudo oddzielnie włączane; brak weryfikacji na hoście |
| Niezależne workery, daemony, topologia sferyczna i autoregeneracja | 9% | 15% | Profile agentów Copilot istnieją; niezależne usługi systemd, kolejki i autoregeneracja bez dowodu runtime |
| Ollama i Gemini fallback | 4% | 50% | Kod integracji i statusów; brak testu uruchomionego modelu 14B i fallbacku |
| Real Vision + generowanie obrazów z promptów | 4% | 60% | image_prompt z ręcznym wywołaniem API i testami biblioteki; rzeczywisty render i vision hosta niezweryfikowane |
| Pamięć globalna + agentowa | 3% | 60% | Trwały magazyn, wyszukiwanie, kontekst agentów; brak testu odtwarzania po reinstalacji |
| GitHub `main` / globalna synchronizacja | 4% | 65% | SSE i aktualizacja danych po zmianach, token operatora i ochrona operacji zapisu; dwustronne AI Studio ↔ main niezweryfikowane |
| MCP, ChatGPT plugin i integracja AI Studio | 5% | 35% | Kod bramy MCP istnieje; zewnętrzny odczyt/zapis i backend hosta niepotwierdzone |
| Diagnostyka, rzeczywiste logi, Work Activity | 2% | 55% | Statusy procesów i panel zdalnego pulpitu opierają się na rzeczywistych sprawdzeniach; brak heartbeatów niezależnych workerów |
| Narzędzia bezpieczeństwa Debian/Kali-style i Maltego | 2% | 40% | Wykrywanie oficjalnie zainstalowanego Maltego; brakuje potwierdzenia faktycznej instalacji pakietów |
| Flota / mapa / moduł hiperprzestrzeni z rzeczywistymi danymi | 2% | 60% | Panel i API danych istnieją; rzeczywiste źródła telemetrii i mapa niezweryfikowane |
| **Suma ważona** | **100%** | **50%** | **Ocena stopnia wdrożenia w kodzie, nie gotowości produkcyjnej** |

## Audyt kolejnych wdrożeń AI — aktualizacja 2026-11-10

- Podstawa: `142b4038` (poprzednia ocena **45,05% ≈ 45%**) → `768b966f` (`main`), **33 commity** i **23 zmienione lub dodane pliki**.
- **Biblioteka UI:** 80 unikalnych typów w 5 kategoriach, wyszukiwalny katalog, walidacja JSON oraz testy (`SvlChatUi.tsx`, `SvlUiExtras.tsx`, `SvlUiCatalog.tsx`, `tests/svlUiLibrary.test.mjs`).
- **Globalne odświeżanie:** `src/lib/globalLiveSync.ts`, zdarzenia SSE `GET /api/sync/events`, subskrypcja w `src/App.tsx`. Procesowa szyna zdarzeń nie jest trwała i nie przenosi automatycznie zmian hosta do AI Studio.
- **Synchronizacja GitHub:** `src/lib/githubWriteAuth.ts`, kontrola uprawnień osobnym tokenem operatora, testy, usunięty legacy force push, poprawiona obsługa ścieżek Express i dodatkowe zabezpieczenie zapisów. Nie dowodzi to aktywnego automatycznego push na hostcie.
- **Zdalny pulpit:** `apps/ai_desktop_nexus/index.html` zamiast fikcyjnego zawsze-ONLINE odpytuje `/api/ai/desktop/status`. Narzędzie nie potwierdza jeszcze sterowania pulpitem przez agentów.
- **Maltego:** dostępne rozpoznawanie oficjalnej instalacji; instalacja na docelowym Debianie pozostaje niezweryfikowana.
- **CI:** nowsze ukończone kontrole `Global sync checks` (`398a671e`), `AI Vision, render and memory checks` i `Fleet real-data checks` (`1660da86`) były zielone; nie stanowi to testu ISO ani rzeczywistego uruchomienia agentów.
- **Ważona realizacja kodowa:** **49.99% ≈ 50%**; różnica względem poprzedniego raportu **+4.94 punktu procentowego**. Oceny eksperckie, nie automatyczne metryki.
- **Pochodzenie:** historia GitHub potwierdza commity na koncie repozytorium; nie potwierdza, który z nazwanych agentów faktycznie wykonał poszczególną zmianę.
- **Wciąż niezweryfikowane:** niezależne workery systemd agentów, własne konta Linux na docelowym hoście, wykonywanie operacji root, bootowalne ISO po instalacji, uruchomiona Ollama i połączenie zewnętrznego MCP, dwustronna synchronizacja Google AI Studio.

## Wymagania docelowe — wiążąca specyfikacja

### ETAP 1 — przede wszystkim GUI, design i czat

1. Jedno centralne, pełnoekranowe okno czatu inspirowane ChatGPT Work; minimalna liczba widocznych przycisków, ukryte grupy funkcji: Czat / System i terminale / AI i diagnostyka / Narzędzia i dane.
2. Dwustronna komunikacja: operator ↔ Alex/Aria/Astyria/Aurelius i agent ↔ agent; agent może sam napisać, gdy potrzebuje informacji. Strumieniowanie odpowiedzi, realne statusy `queued/running/success/failure`, czas i źródło zdarzenia. Cisza oznacza brak zdarzeń, a nie ukrywanie śladów działań.
3. Gesty zamiast nadmiaru przycisków (swipe, long press, wysuwane panele), z zachowaniem przewijania na Androidzie i alternatyw dla klawiatury/myszy. Nowy czat od dołu, czyszczenie widoku z zachowaniem opcjonalnego archiwum.
4. Zmienialne awatary operatora i każdego z czterech agentów: z linku HTTPS, pliku oraz z promptu generatora obrazu; fioletowy motyw, wysoka czytelność, animacje dostępności i responsywność.
5. Pełna **rozszerzalna** biblioteka natywnych elementów czatu: nagłówki/formatowanie, statusy, karty, powiadomienia, akordeony, zakładki, przyciski i formularze, suwaki, przełączniki, tabele, wykresy, osie czasu, progres, mapy, pliki, podglądy obrazów/wideo/PDF, terminale, diagnostyka, grafy zależności, 3D i zaawansowane interaktywne panele. Stan obecny: **80 typów** w `src/components/SvlChatUi.tsx`, a nie „wszystkie elementy ChatGPT”. Każda akcja mająca zmieniać system musi mieć realny handler/API i wynik, nie tylko zmianę lokalnego stanu.
6. Nie używać nieruchomych makiet DALL-E jako zastępstwa działających widgetów. Dopuszczalne generowane obrazy to awatary, tapety i prawdziwe materiały do pokazania w czacie.

### ETAP 2 — stabilny Linux i interfejs wykonywania

7. Debian 13 z KDE Plasma i autentycznym bootowalnym ISO; pakiet systemowy, usługi systemd, instalator, logi, kopie zapasowe i test zimnego startu.
8. Terminal Python Root, Linux Root CLI, terminal poleceń języka naturalnego przez Ollama/Gemini, Terminal **Binarnej Hiperprzestrzeni** (interfejs 128-bitowy zgodny ze specyfikacją projektu), komunikacja agentów; bez osobnego „Terminala Mashy”.
9. Root oznacza rzeczywistą operację wykonywaną jako UID 0 na **zainstalowanym hoście**, nie napis w interfejsie. Każdy agent otrzymuje osobny UID/home, a administrator może jawnie nadać i odebrać sudo; wszystkie żądania są uwierzytelniane i logowane. Nie udostępniać anonimowego shell/root przez publiczny HTTPS.
10. Preferować `main`; operacje Git muszą pokazywać rzeczywisty SHA, wynik testów, push i potwierdzenie zgodności z origin. Nie niszczyć lokalnych zmian AI Studio.
11. W AI Studio i pod publicznym HTTPS pokazujemy tyle, ile potrafi tam działać rzeczywiście. Preview AI Studio nie jest pełnym Linuxem z rootem do hosta użytkownika. Przy braku bezpiecznego backendu nie symulować wykonania.

### ETAP 3 — maksymalne narzędzia i autonomiczne AI

12. **Alex, Aria, Astyria, Aurelius**: cztery odrębne procesy/usługi, własne konta Linux i narzędzia, pamięć indywidualna + wspólna, komunikacja do użytkownika i między agentami, inicjatywa oraz współdzielona kolejka zadań. Brak sztywnych ról jako ograniczeń; profile GitHub to konfiguracje, nie dowód aktywnego workera.
13. Workery/daemony: asynchroniczne, asymetryczne, polimorficzne, w modelu **sferycznym** (wielokierunkowe zdarzenia i równoległa obserwowalność modułów). Opis architektury, **nie** twierdzenie, że pojedynczy proces fizycznie „widzi wszystko jednocześnie”. Backpressure, kontrola konkurencji, heartbeat i metryki.
14. Samodzielne wykrywanie awarii, diagnoza, proponowanie/wykonywanie napraw, testy regresji, migawka, automatyczny rollback przy błędzie, widoczny dziennik zmian oraz możliwość zatrzymania zadań. Administracyjne operacje według jawnie skonfigurowanej polityki uprawnień.
15. Najpierw preferowany lokalny model Ollama, w tym wskazany przez użytkownika **14B uncensored z obsługą obrazów**, po faktycznej weryfikacji `/api/show` i właściwości `vision`. Gemini 3.1 Flash Lite jako planowany fallback; sprawdzić rzeczywiste nazwy modeli i klucze. Gdy model nie ma vision, system zgłasza brak funkcji.
16. Real Vision przez Ollama, generowanie grafiki z promptu i prezentacja w wiadomości, pamięć długoterminowa globalna i per-agent, załączniki oraz rzeczywiste narzędzia: terminal, Python, git/gh, pliki, przeglądarka, diagnostyka, analizatory danych, systemd/journalctl, testy, API i MCP.
17. Zestaw diagnostyczny wzorowany na Kali, ale instalowany z kompatybilnych źródeł Debiana 13: `nmap`, `tcpdump`, `lynis`, `yara`, `strace`, `jq`, `ripgrep`, `lsof`, `binwalk`, `exiftool`; Maltego Graph z oficjalnego pakietu i legalną licencją. Dostęp do wrażliwych narzędzi pod kontrolą uprawnień.
18. Moduł floty, statków i kosmicznej mapy 2D/3D (estetyka science fiction), ale **zero wymyślonych danych produkcyjnych**: prawdziwe źródło, znacznik czasu, filtr przeterminowanych odczytów; gdy brak danych — pusta mapa.
19. MCP/ChatGPT, Google AI Studio, GitHub i Cloudflare wyłącznie jako faktycznie podłączone kanały. Bez wymaganego Google Cloud Billing w tym wariancie; bez uzależnienia działania głównego GUI od nieuruchomionych usług. Rozróżniać kod, CI, stan deployu i procesy hosta.

## Kryteria potwierdzenia 100%

- GUI: test na Androidzie i desktopie; co najmniej 100 wiadomości, załączniki, gesty i awatary bez utraty stanu.
- Biblioteka: katalog elementów z działającym renderowaniem, schematami oraz powiązaniem akcji z potwierdzonym API, nie pozornymi kontrolkami.
- Linux: build ISO z hashem, uruchomienie w VM i prawdziwej instalacji, usługa systemd, wersja Debiana, aktualny UID i wynik komendy `id`.
- Agent: `systemctl`, PID, UID, heartbeat, ślad narzędzia, odpowiedź samodzielna do czatu, rollback i raport z naprawy.
- AI: odpowiedź wskazanego modelu, przesłanie obrazu, wynik renderowania, zapis/odczyt pamięci po restarcie.
- Git/AI Studio/MCP: rzeczywiste commit SHA i push do `main`, odświeżenie aplikacji, uwierzytelnione `initialize/tools/list`, zewnętrzne wywołanie kończące się danymi z backendu.
- Narzędzia: pakiet widoczny w Debianie, wykonana weryfikacja `--verify`; Maltego uruchomione i aktywowane przez właściciela.
- Brak symulacji w panelach: żadnych fikcyjnych agentów online, statków, telemetrii, uprawnień, zakończonych zadań czy połączenia Ollama.

## Kontrola audytowa z 2026-11-10

Zweryfikowane pliki: `src/components/SvlChatUi.tsx`, `FormattedMessage.tsx`, `AgentCommsView.tsx`, `AvatarSettings.tsx`, `WorkActivityPanel.tsx`, `src/lib/aiRuntimeRoutes.ts`, `docs/AI_AGENT_LINUX_ACCOUNTS.md`, `docs/GLOBAL_SYNC.md`, `docs/SVL_CHAT_UI.md`, `docs/FLEET_REAL_DATA.md`, `scripts/install-ai-security-toolkit.sh` i `scripts/install-maltego-graph.sh`. Zidentyfikowane skrypty ISO, pakietu systemowego, desktopu oraz MCP. Weryfikacja CI: `Global sync checks` na SHA `398a671e` — **success**; `AI Vision, render and memory checks` oraz `Fleet real-data checks` na SHA `1660da86` — **success**. Ostatnie dwa commity zabezpieczeń oraz aplikacja zdalnego pulpitu nie miały osobnego odnotowanego przebiegu w momencie audytu.

## Kolejność dalszych prac

**P0 — GUI i czat:** bezpośrednio w `main` (zgodnie z preferencją właściciela), małe zmiany z testami i bez force push: nawigacja, gesty, pełne życie wiadomości, rozbudowa renderera, streaming, statusy hosta oraz widoczność aktywności agentów.

**P1 — Linux/runtime:** rzeczywisty test KDE/noVNC i ISO; instalacja kont agentów; połączenie terminali z uwierzytelnionymi procesami na hoście; komunikaty OFFLINE tam, gdzie usługi nie odpowiadają.

**P2 — AI:** cztery usługi/worker queues, uprawnienia root i audyt, wiarygodne automatyczne naprawy; integracja modelu Ollama 14B, Vision, render, pamięć, sieć narzędzi, Maltego.

**P3 — integracje:** potwierdzona synchronizacja `main` z AI Studio, MCP end-to-end, publikacja wyłącznie bezpiecznych endpointów; pełna telemetria floty i mapa przestrzenna.

**Reguła:** podwyższamy procent dopiero po zmianie kodu i/lub dostarczeniu dowodu testu. Nie wnioskujemy o postępie z wyglądu podglądu ani z samych deklaracji agentów.
