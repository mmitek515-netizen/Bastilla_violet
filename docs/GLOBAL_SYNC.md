# Globalna synchronizacja Bastilla OS / SVL_System

## Aktywna aplikacja — czat i status

Serwer publikuje `GET /api/events` (SSE). Po zapisaniu rozmów, wiadomości,
awatarów i pozostałych wspieranych zmian wysyła sygnał aktualizacji bez treści
wiadomości i sekretów. Otwarte karty pobierają aktualny stan z szybkiego
`GET /api/state`; diagnostykę z `GET /api/health` pobiera się oddzielnie,
więc wolna Ollama nie opóźnia synchronizacji czatu. Po ponownym połączeniu
karty odczytują stan także po zdarzeniu `ready`. Jest również okresowy odczyt
zapasowy i odświeżenie po powrocie do karty.

Zapis wiadomości i odpowiedź HTTP nie czekają na generowanie przez model;
status odpowiedzi zmienia się po jej rzeczywistym zakończeniu. Zdarzenia
działają wyłącznie między klientami tego samego procesu backendu i nie są
trwałą kolejką. Połączenie lub odczyt mogą się nie powieść.

Swobodna odpowiedź AI nie jest dowodem zmiany konfiguracji ani wykonania
poleceń. Tylko rzeczywiście podłączone operacje backendu mogą zmieniać stan.
Flota i HyperCom korzystają z odrębnych rejestrów i odświeżania; zmiany poza
backendem, inne instancje serwera, host Linux oraz wdrożenia GitHub/AI Studio
nie są automatycznie synchronizowane przez tę szynę.

Stary panel misji nie zastępuje DATA_STORE stanem z odpowiedzi misji.
Skan logów pozostaje niedostępny bez zweryfikowanego endpointu tylko do
odczytu. Odczyt jądra nie migruje ani nie zapisuje konfiguracji modeli.

## Historyczna integracja GitHub

Poniższy opis dotyczy starszej, niepodłączonej wersji interfejsu; nie opisuje
gwarancji aktualnego panelu.

Panel **Synchronizacja aplikacji** korzysta z `GET /api/triad/git/status`
i `POST /api/triad/github/sync`. Status odświeża się co 15 s i po powrocie do okna.
Pomyślny Git push musi zostać potwierdzony polem `pushed:true`.
Dotyczy to również przycisku **Wyślij zmiany na main** w Eksploratorze Plików:
odpowiedź HTTP 200 czy samo `success:true` nie potwierdzają synchronizacji.
Klient akceptuje tylko odpowiedź z `success:true`, `pushed:true` i `branch:main`.
Na innych gałęziach niż main oraz bez lokalnego checkoutu Git przycisk jest wyłączony.

Tryb automatyczny jest **wyłączony domyślnie**. Wymaga jawnego ustawienia
w lokalnym środowisku procesu (nie w publicznym repo):

```dotenv
SVL_GIT_AUTO_SYNC=on
SVL_GIT_AUTO_PUSH=on
```

Warunki uruchomienia: lokalny checkout Git, aktywna gałąź `main`,
`origin` wskazujące `mmitek515-netizen/SVL_System` i rzeczywiste
uwierzytelnianie GitHub umożliwiające push. Kod obserwuje zmiany w dozwolonych
ścieżkach, czeka na stabilizację, wykonuje testy, lint i build przed commitem;
nie eksportuje lokalnych baz, sekretów i historii rozmów.
**Nie używa force push.** Konflikt z nowszym origin jest błędem wymagającym
uzgodnienia, nie powodem do nadpisywania historii.

Wynik `autoSync: true` znaczy, że proces obserwacji został uruchomiony;
nie dowodzi, że wszystkie commity dotarły na GitHub. Zmiany w GitHub
nie oznaczają natychmiastowej aktualizacji już działającego wdrożenia.

### Autoryzacja HTTP i wycofane endpointy

Po audycie bezpieczeństwa każda mutacja `/api/github/*`, `/api/triad/github/*`, `/api/triad/git/*` oraz `POST /api/triad/commit` wymaga nagłówka `Authorization: Bearer <SVL_GITHUB_WRITE_TOKEN>` z osobnym silnym sekretem skonfigurowanym lokalnie (co najmniej 32 znaki). Bez niego API odrzuca operacje kodem HTTP 403. Token nie może być tożsamy z GitHub PAT / GITHUB_TOKEN, nie zapisuj go do repo ani localStorage. Panel synchronizacji ma pole sekretnych danych, a Eksplorator prosi o sekret przy zapisie.

Endpointy `/api/github/export` i `/api/github/pull` są wycofane (HTTP 410 po uwierzytelnieniu): nie zapisujemy PAT w `git remote` ani nie wykonujemy nadpisującego katalogi importu. Synchronizacja `main` nadal wymaga faktycznego checkoutu i istniejącego połączenia GitHub. Działanie w AI Studio bez hosta Git nie jest symulowane.

CI obejmuje także `tests/githubWriteAuth.test.mjs` oraz `tests/securityAndDesktopRegression.test.mjs`.

## Warstwa 3 — Google AI Studio

AI Studio Build/Preview nie zawsze ma katalog `.git` i nie zapewnia bezpośredniego
dostępu do powłoki hosta. Zmiany w AI Studio należy **synchronizować przez
integrację GitHub w panelu AI Studio** i wdrożyć/odświeżyć uruchomioną aplikację.
Nie istnieje automatyczna dwukierunkowa propagacja danych i kodu tylko dlatego,
że przycisk w Bastilla OS jest zielony.

Ważne: przycisk w Eksploratorze Plików **wysyła kod z lokalnego hosta do GitHub**.
Nie pobiera nowego `main` z GitHub do AI Studio. Użytkownik musi użyć funkcji importu/
pobrania zmian w integracji GitHub istniejącej aplikacji AI Studio. Nie nadpisuj
niesynchronizowanych zmian AI Studio bez ich wcześniejszego zabezpieczenia.

W projekcie AI Studio, po pobraniu `main`, sprawdź działanie przycisku
**Synchronizuj** i etykietę `DATA_STORE`. Jeśli backend kernel Python nie jest
uruchomiony, zobaczysz **OFFLINE** — jest to poprawna diagnostyka.

## Testy

CI: `.github/workflows/global-sync-check.yml` uruchamia `npm test`,
`npm run lint`, `npm run build` i `npm run build:server`.
Testy `tests/globalSync.test.mjs` weryfikują walidację migawki i ochronę
przed nadpisaniem nowszych zmian.

Sukces CI oznacza poprawność kodu w testowym środowisku GitHub Actions,
a nie dowód, że preview AI Studio ma działający backend lub połączenie GitHub.
