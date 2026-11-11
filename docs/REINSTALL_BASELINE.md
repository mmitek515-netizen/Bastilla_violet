# Bastilla OS SVL_System — czysta baza po reinstalacji

Ten dokument opisuje procedurę przygotowania nowej instalacji. Zmiany w repozytorium same w sobie nie instalują systemu operacyjnego ani nie resetują urządzenia.

## Zmiana historii śledzonych danych (10.11.2026)

Czyszczenie kodu źródłowego usunęło z bieżącej gałęzi `main` stare dane wykonawcze: pliki `data/databases/*.sqlite`, automatyczne migawki w `exports/`, rejestr `.svl_deployments.json`, testowy bundle i pusty `bun.lock`. Zachowano kod aplikacji, skrypty wdrożeniowe, konfigurację ISO, testy i plik `package-lock.json`.

**Przed synchronizacją starszego checkoutu wykonaj osobną kopię baz i eksportów, jeżeli zawierają potrzebne dane.** Zmiany w Git mogą usunąć poprzednio śledzone ścieżki przy przejściu na nowszy commit. Ignorowanie nowych plików w `.gitignore` nie tworzy ich kopii. Przykładowe odzyskiwanie pojedynczego starego pliku z punktu sprzed czyszczenia, bez przywracania całego stanu systemu:

```sh
git show 85b884accd0c019d47a8e93101da05531235c295:data/databases/hyper_com_db.sqlite > ./hyper_com_db.backup.sqlite
```

Usunięte artefakty pozostają w poprzednich commitach; to **nie** jest czyszczenie historii Git ani gwarancja usunięcia poufnych danych z publicznego repozytorium. Pełne usuwanie historii wymaga osobnej operacji i kontroli wszystkich kopii.

## Tożsamość i stan repozytorium

- Nazwa systemu/aplikacji: **Bastilla OS SVL_System**
- Ekran wejściowy aplikacji: **Enter hyperspace**
- Repozytorium: `mmitek515-netizen/SVL_System`
- Główna gałąź: `main`

Repozytorium zachowuje historię Git i kod. Ekran powitalny jest elementem aplikacji webowej: kliknięcie **ENTER HYPERSPACE** otwiera istniejący pulpit, a wybór jest zapisywany w localStorage bieżącej przeglądarki. Aby ponownie zobaczyć ekran, wyczyść dane witryny dla aplikacji lub użyj świeżego profilu przeglądarki.

## Co oznacza „czysta instalacja”

Nowa instalacja systemu docelowego powinna używać świeżo zbudowanego obrazu i pustych danych runtime. Nie kopiuj automatycznie z poprzedniej instalacji sekretów, historii czatu, baz lokalnych, danych aplikacji ani dysków VM. Repozytorium nie zawiera prywatnego pliku `.env`; utwórz go lokalnie na podstawie `.env.example` tylko wtedy, gdy `.env` jeszcze nie istnieje.

## Wybierz rodzaj reinstalacji

Te procedury mają różny zakres i nie są zamienne:

- **Repozytorium** przywraca śledzone pliki do wskazanej gałęzi Git. Nie instaluje systemu operacyjnego. `git reset --hard` usuwa niezapisane zmiany w śledzonych plikach; przed nim zachowaj lub zatwierdź potrzebne zmiany. Nie używaj `git clean -fdx`, jeśli chcesz zachować `.env`, zależności, dane runtime albo lokalne pliki.
- **Pakiet `bastillaos-system`** reinstaluje aplikację i usługę. Aktualizacja pakietu zachowuje istniejące pliki w `/var/lib/bastillaos/system`; kopiuje tylko brakujące wartości domyślne. Usunięcie pakietu zatrzymuje usługę, ale skrypty pakietu nie kasują tego katalogu.
- **Pełna instalacja ISO** reinstaluje Debian i komponenty systemowe na wybranym dysku. W zależności od partycjonowania może usunąć wszystkie dane użytkownika, aplikacji i runtime na tym dysku.

## Reinstalacja repozytorium

Zachowaj poza repozytorium potrzebne zmiany i prywatne ustawienia, a następnie sprawdź stan checkoutu. Przykład przywrócenia śledzonych plików do `origin/main`:

```sh
git status --short --branch
git fetch origin main
git reset --hard origin/main
npm ci
```

To nie usuwa plików ignorowanych przez Git. Zachowaj `.env` i nie kopiuj przykładowego pliku na istniejącą konfigurację:

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
```

Po instalacji zależności uruchom testy i walidację z sekcji „Walidacja”. Gdy celem jest czysta instalacja systemu, samo odtworzenie repozytorium nie wystarczy — zbuduj i zainstaluj ISO opisane poniżej.

## Reinstalacja samego pakietu

Ta ścieżka dotyczy już zainstalowanego BastillaOS i nie formatuje dysku. Zbuduj artefakty i pakiet z repozytorium:

```sh
npm ci
npm run build
npm run build:server
./bastillaos/system-package/build-package.sh
./bastillaos/system-package/test-package.sh
```

Zainstaluj wygenerowany pakiet z `bastillaos/build/` poleceniem `sudo apt install ./bastillaos/build/bastillaos-system_*.deb`. Pakiet uruchamia usługę `bastillaos-system.service`; podczas aktualizacji zachowuje zapisane dane i restartuje usługę. Konfiguracja sekretów pozostaje w `/etc/bastillaos/system.env`, poza repozytorium.

## Pełna reinstalacja systemu

### Kopia danych

Przed instalacją wybierz dane do zachowania i skopiuj je na bezpieczny, najlepiej szyfrowany nośnik. Sprawdź kopię na innym urządzeniu. Typowe lokalizacje to:

- `/home/<użytkownik>/` — pliki użytkownika i konfiguracja pulpitu.
- `/var/lib/bastillaos/system/` — DATA_STORE, historia, aplikacje, eksporty i runtime aplikacji; mogą tu być także duże dyski VM oraz klucze dostępu.
- `/etc/bastillaos/system.env` — sekrety i ustawienia usługi; traktuj kopię jak dane poufne i po przywróceniu ustaw właściciela `root` oraz tryb `0600`.

Nie umieszczaj tych kopii w repozytorium ani w publicznym artefakcie ISO. Pełne przywrócenie starego katalogu runtime może odtworzyć konfigurację, historię lub nieaktualne pliki; przywracaj dane selektywnie.

### Zbudowanie i sprawdzenie nośnika

Zbuduj obraz zgodnie z [instrukcją BastillaOS](../bastillaos/README.md), a następnie zweryfikuj sumę:

```sh
bash bastillaos/build-iso.sh
(cd bastillaos/build && sha256sum -c BastillaOS-13-amd64.iso.sha256)
```

Zapis ISO na USB nadpisuje wskazany nośnik. Zweryfikuj urządzenie docelowe w programie do nagrywania przed rozpoczęciem zapisu. Alternatywnie uruchom ISO w nowej maszynie wirtualnej, aby przetestować je bez zmian na hoście.

GitHub Actions może zbudować obraz po ręcznym uruchomieniu workflow lub po wypchnięciu tagu `bastillaos-v*`. Artifact workflow nie jest automatycznie zapisywany do `main` ani instalowany na komputerze.

### Instalacja i pierwsze uruchomienie

1. Uruchom komputer lub VM z przygotowanego nośnika.
2. W instalatorze Debiana sprawdź nazwę i rozmiar dysku docelowego. Opcja użycia całego dysku usuwa jego wcześniejsze partycje i dane; wybierz ją tylko wtedy, gdy taki jest zamiar i kopia zapasowa została sprawdzona.
3. Dokończ instalację, uruchom system ponownie z dysku i wyjmij nośnik instalacyjny.
4. Sprawdź usługę i logi: `sudo systemctl status bastillaos-system.service` oraz `sudo journalctl -u bastillaos-system.service -b`.
5. Skonfiguruj `/etc/bastillaos/system.env` tylko wtedy, gdy jest potrzebne, ustaw `root:root` i tryb `0600`, a następnie zrestartuj `bastillaos-system.service`.
6. Zweryfikuj lokalny interfejs pod `http://127.0.0.1:3000`, działanie sieci i Ollamy oraz wymagane urządzenia. Sama odpowiedź HTTP nie potwierdza działania roota, KVM ani innych funkcji hosta.
7. Przywracaj wybrane pliki i aplikacje dopiero po potwierdzeniu, że nowa instalacja działa. Nie kopiuj sekretów do Git ani na publiczny port.

Obecność terminala, jądra SVL lub kodu integracji w repozytorium nie potwierdza uprawnień root na hoście, działania daemonów, uruchomienia Ollamy ani instalacji systemu.

## Uruchomienie aplikacji webowej w checkoutcie

Wymagane są Node.js 22+, npm 10.5.1+ i Python 3:

```sh
npm ci
if [ ! -f .env ]; then cp .env.example .env; fi
npm run dev
```

Uzupełniaj `.env` lokalnie i nie commituj sekretów. Lokalny czat wymaga niezależnie uruchomionej usługi Ollama oraz pobranego i skonfigurowanego modelu. Panel diagnostyczny może pokazać status dostępny z uruchomionej aplikacji; nie zastępuje kontroli hosta.

## Walidacja

Testy aplikacji można uruchomić z katalogu repozytorium:

```sh
npm test
npm run lint
npm run build
npm run build:server
```

Sukces tych poleceń nie dowodzi, że ISO się uruchamia albo że wszystkie urządzenia i uprawnienia hosta działają. Weryfikację ISO i systemu po instalacji wykonaj w środowisku docelowym.
