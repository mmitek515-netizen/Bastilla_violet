# Higiena repozytorium SVL_System / BastillaOS

Aktualizacja: 2026-11-10. Główna gałąź: `main`.

## Co przechowujemy w Git

- Kod `src/`, `apps/`, `Nowy_system/`, `server.ts`, moduły `exports/*.py` i `exports/*.sh`.
- Konfiguracja `bastillaos/`, skrypty budowania ISO, testy, workflows GitHub.
- `package.json` i `package-lock.json` (projekt korzysta z npm; pusty `bun.lock` usunięto).
- Dokumentacja oraz stałe zasoby potrzebne do budowania.

## Czego nie dodajemy do Git

- Bazy wykonawcze `data/databases/*.sqlite` oraz pliki dzienników SQLite.
- Pliki `exports/svl_datastore.json`, `exports/SNAPSHOT-*.json`, `exports/*_snapshot.json`, `exports/baza_danych_*.json`, archiwa tar.gz.
- Stan wdrożeń `.svl_deployments.json`, lokalne sekrety, `.env`, dyski VM.
- Wyniki `dist/`, `build/`, `node_modules/` i tymczasowe katalogi pakowania.

Skrypt `pack-system-defaults.cjs` dodatkowo filtruje runtime z paczki instalacyjnej. `data/databases/.gitkeep` zachowuje strukturę pustego katalogu.

## Odzyskiwanie historycznych danych

Przed aktualizacją starszego checkoutu **wykonaj kopię danych**. Usunięcie plików śledzonych z `main` może skasować odpowiadające im ścieżki w lokalnym checkoutcie podczas aktualizacji.

Stan sprzed porządkowania jest zachowany w commicie `85b884accd0c019d47a8e93101da05531235c295`. Przykład odzyskania pojedynczego pliku z historii, bez cofania bieżącej gałęzi:

```sh
git show 85b884accd0c019d47a8e93101da05531235c295:exports/svl_datastore.json > ./svl_datastore.backup.json
```

Uwaga: ponieważ repozytorium jest publiczne, usunięcie plików z ostatniego commitu **nie usuwa ich z wcześniejszych commitów**. Nie przeprowadzano przepisywania historii, kasowania issue/PR ani zmian na działającym hoście.

## Budowa ISO

Gotowy plik `.iso` nie jest normalnym plikiem źródłowym w gałęzi `main`. W workflow `Build BastillaOS Debian Live ISO` użyj `Run workflow`; **po udanym buildzie** ISO i `.sha256` będą dostępne jako artefakt workflow. Lokalnie:

```sh
bash bastillaos/build-iso.sh
(cd bastillaos/build && sha256sum -c BastillaOS-13-amd64.iso.sha256)
```

Budowa ani uruchomienie obrazu nie zostały potwierdzone samym porządkowaniem źródeł.
