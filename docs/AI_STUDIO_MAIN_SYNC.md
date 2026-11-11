# Bastilla OS — synchronizacja Google AI Studio ↔ GitHub main

Repozytorium: https://github.com/mmitek515-netizen/SVL_System
Gałąź: **main**, bez dodatkowych branchy.

## Natywny Push/Pull w aktualnym projekcie AI Studio

Google AI Studio Build: **Settings → GitHub** → połącz istniejące
mmitek515-netizen/SVL_System (nie twórz nowego repo).

- **Push**: sprawdź listę zmian z AI Studio i zapisz je jako commit na main.
  Szczególnie zachowaj nowe skrypty workerów, obserwatora Linuxa, backend
  server.ts i autorski design GUI. Sprawdź potwierdzony SHA commita.
- **Pull**: pobierz nowe commity z main po zapisaniu lokalnych zmian.
  Gdy GitHub jest nowszy lub występuje konflikt, użyj w AI Studio
  Resolve conflicts i rozstrzygnij zmiany per plik bez nadpisywania workerów.
- Na końcu sprawdź commit w:
  https://github.com/mmitek515-netizen/SVL_System/commits/main

Jeżeli panel pokazuje tylko Create new repository, najpierw zachowaj
nieprzesłane zmiany przez Download App (ZIP), a następnie połącz istniejący
projekt przez Settings → GitHub albo Import from GitHub w Build. Nie twórz
duplikatu repozytorium.

**Ważne:** GitHub Push/Pull jest natywną funkcją AI Studio, a nie
SSE czatu. Nie ma potwierdzenia, że sama zielona dioda interfejsu
oznacza zapis commita. Sam commit nie przeinstalowuje Linuxa ani
automatycznie nie aktualizuje zdalnego preview.

## CLI opcjonalnie na realnym checkoutcie Git

Dla hosta mającego katalog .git i autoryzowane połączenie GitHub:

    node scripts/github-main-sync.mjs status
    node scripts/github-main-sync.mjs pull
    node scripts/github-main-sync.mjs push
    node scripts/github-main-sync.mjs commit-push

Status porównuje lokalny HEAD i zdalne main. Pull stosuje tylko fast-forward
dla czystego drzewa roboczego. Push nie pozwala nadpisywać nowszych commitów.
Commit-push zapisuje tylko dozwolone pliki projektu i potwierdza zdalny SHA.
Nie używa force push. Nie zapisuje baz, tokenów ani plików .env.

W podglądzie AI Studio bez katalogu .git skrypt prawidłowo odmawia
operacji i wskazuje Settings → GitHub jako właściwą ścieżkę.

## Inny częsty problem uruchomienia

W starym commitcie package-lock.json nie odpowiadał aktualnemu
package.json. Jeśli npm ci zgłasza niespójność zależności, wygeneruj
lockfile w obsługiwanym środowisku poleceniem:

    npm install --package-lock-only --ignore-scripts

i zapisz ten plik przez Push wraz z pozostałymi zmianami. Nie zmieniaj
sekretów środowiskowych ani komponentów designu przy synchronizacji.
