# Bastilla OS — Flota i statki kosmiczne (bez symulacji)

## Dostarczony moduł

Zakładka **Flota** jest dostępna w nawigacji oraz na pulpicie.
Wewnątrz działa interaktywny panel inspirowany sterowaniem ChatGPT:
mapa XY, powiększanie i przesuwanie, wybór obiektów, widok listy, wyszukiwarka,
filtry, panel pochodzenia danych, historia czasu ostatniej obserwacji oraz
formularz rejestracji **projektu obiektu** (bez deklarowania istnienia statku).

Puste repozytorium floty oznacza zero statków i pustą mapę.
Wszystkie pozycje wymagają uwierzytelnionego raportu od zewnętrznego nadawcy.
Po 5 minutach od czasu obserwacji znikają z mapy jako nieaktualne,
ale zachowują ślad pochodzenia i czas ostatniego raportu. Nie obliczamy ETA,
prędkości, trajektorii, pozycji planet ani statusu realizacji misji z domysłów.
Dane otrzymane przez uwierzytelnione API nie dowodzą niezależnie fizycznego
istnienia obiektu — potwierdzają tylko, że przesłało je określone źródło.

## API

- `GET /api/fleet` — aktualny rejestr, znaczniki czasu i źródła;
- `GET /api/fleet/telemetry` — wyłącznie pozycje z raportów;
- `GET /api/fleet/contacts` — tylko obiekty z ostatnim, ważnym czasowo raportem;
- `POST /api/fleet/ships` — rejestruje **projekt**, bez statusu online;
- `POST /api/fleet/telemetry` — zapisuje raport współrzędnych J2000 od
  uwierzytelnionego nadawcy.

Do odczytu i rejestracji służy `FLEET_ADMIN_TOKEN`, do przesyłania
telemetrii osobny `FLEET_INGEST_TOKEN` oraz lista `FLEET_ALLOWED_SOURCES`
(identyfikatory zaufanych nadawców rozdzielone przecinkami).
Przy pustej liście nadawców odbieranie telemetrii jest zablokowane.
Tokeny muszą być różne i każdy powinien mieć minimum 32 znaki;
ustaw je wyłącznie po stronie serwera w menedżerze sekretów. Tokeny nie
powinny być równe. Przy braku konfiguracji API zwraca 503, a nie fikcyjne
statki. Panel wymaga wpisania tokenu operatora w bieżącej karcie przeglądarki;
nie zapisuje go do localStorage. Uwierzytelnianie nie zastępuje niezależnej
kontroli autentyczności danych z urządzenia.

Dane są zapisywane atomowo w `DATA_DIR/fleet-registry.json` (domyślnie
`data/fleet-registry.json`) i ignorowane przez Git.
Ustaw `FLEET_STORE_PATH` na trwały, prywatny dysk/wolumen. Bez trwałego dysku
(np. efemeryczne kontenery Cloud Run) rejestr może zostać utracony przy restarcie;
wtedy konieczna jest zewnętrzna baza danych lub trwałe repozytorium danych.
Nie wkładaj realnych lokalizacji i danych transmisji do publicznego GitHub.

Przykładowy **format żądania** (bez wymyślonych współrzędnych):

```json
{
  "shipId": "<identyfikator z rejestru>",
  "sourceId": "<identyfikator ze skonfigurowanej listy FLEET_ALLOWED_SOURCES>",
  "sourceRef": "<identyfikator rzeczywistego raportu>",
  "observedAt": "<rzeczywisty czas w ISO-8601 UTC>",
  "coordinateFrame": "heliocentric_ecliptic_J2000",
  "xAu": "<liczba ze źródła>",
  "yAu": "<liczba ze źródła>",
  "zAu": "<liczba ze źródła>"
}
```

W rzeczywistym JSON pola `xAu`, `yAu`, `zAu` muszą być liczbami.
Przy raportach demonstracyjnych, niewłaściwym czasie lub układzie odniesienia
API zwraca błąd. Raporty z identyfikatorów źródeł spoza listy są odrzucane.
Nie ma generatorów pozycji, danych testowych ani sztucznego przemieszczania
obiektów w produkcyjnym module.

## AI Studio

Po synchronizacji `main` w Google AI Studio otwórz zakładkę **Flota i statki
kosmiczne**. Backend musi uruchamiać `server.ts` (wymagane API `/api/fleet`).
Brama uruchamiana przez `npm run mcp:ai-studio` nie zawiera pełnego interfejsu
Floty. Ustaw oba różne tokeny oraz listę FLEET_ALLOWED_SOURCES w Secrets backendu. W aplikacji nie wykonuj pozorowanych
`ONLINE`, fikcyjnych przelotów ani nadawania nieistniejących sygnałów.

Testy: `npm test`, `npm run lint`, `npm run build`,
`npm run build:server`; CI: `.github/workflows/fleet-real-data.yml`.
