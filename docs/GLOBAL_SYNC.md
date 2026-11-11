# Globalna synchronizacja Bastilla OS / SVL_System

## Warstwa 0 — szyna zdarzeń (nowa, po komendach w czacie)

Backend udostępnia `GET /api/sync/events` (Server-Sent Events) i
`GET /api/sync/status`. Po zakończeniu modyfikującego żądania HTTP
w obszarach czatu, kernela, aplikacji, floty, baz, misji i AI publikuje
powiadomienie o unieważnieniu wcześniejszego odczytu. Przeglądarki
subskrybują SSE, a aktualnie otwarte panele odczytują dane ponownie
z autorytatywnych API. Zdarzenie nigdy nie jest samo w sobie dowodem
zapisania konkretnej zmiany. Jest tylko sygnałem „sprawdź ponownie”.

Uzupełnienie starego polling 4 s: `EventSource` ma automatyczny retry;
przy braku połączenia nadal działa okresowy odczyt. Ręczny przycisk
Synchronizuj wywołuje odświeżenie także paneli narzędzi.
Szyna jest **lokalna dla pojedynczego procesu Node**, nie ma trwałej kolejki,
odporności na restart ani synchronizacji pomiędzy niezależnymi backendami.
Nie publikuje sekretów lub treści czatu.

**Ważne ograniczenia:** zmiany hosta Linux wykonane zewnętrznie (apt,
systemd, root shell, Docker, inny proces) nie powodują automatycznie
zdarzenia, jeżeli nie przechodzą przez backend Bastilla. Ollama i workery
SPAA muszą mieć rzeczywiste podłączone API/adaptery i odczyt po statusie.
Synchronizacja GitHub main nie instaluje kodu na hostcie i nie aktualizuje
sama Preview Google AI Studio. Stan systemu jest potwierdzony wyłącznie
z odczytu backendu, nie z wygenerowanego komunikatu AI.

## Warstwa 1 — DATA_STORE (interfejs ↔ backend)

Źródłem prawdy jest Python SVL Kernel udostępniany przez `GET /api/kernel/state`.
Przeglądarka nie może traktować samego localStorage jako potwierdzonego stanu systemu.

- Automatyczny odczyt co ~4 s i przy aktywacji karty/okna.
- Zmiany między kartami tej samej przeglądarki przyspieszają odczyt z backendu przez `storage` event.
- Odrzucamy niepełne odpowiedzi serwera i wyniki starych żądań rozpoczętych przed zapisem lub czatem.
- Przycisk **Synchronizuj** wykonuje tylko `GET /api/kernel/state?fresh=1`.
  Nie uruchamia już misji `sync_versions` (ta tworzy migawki i zmienia konfigurację).
- HTTP error lub brak kompletnego stanu pokazuje błąd, nie fałszywy zielony sukces.
- Backend nie może zastępować błędu `fresh=1` starą pamięcią podręczną.
- Etykieta DATA_STORE ONLINE/OFFLINE dotyczy osiągalności API, nie możliwości działania roota,
  Ollamy ani synchronizacji GitHub.

## Warstwa 2 — GitHub (kod ↔ origin/main)

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
