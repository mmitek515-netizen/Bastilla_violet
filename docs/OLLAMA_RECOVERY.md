# Przywrócenie konfiguracji Ollamy w BastillaOS

## Skąd pochodziły wymuszone ustawienia?

Commit `8988db17` z 2026-10-22 dodał historyczny `scripts/setup-ollama.sh`. Skrypt tworzył `/etc/systemd/system/ollama.service.d/bastillaos-tuning.conf` (m.in. `OLLAMA_KEEP_ALIVE=24h`, `OLLAMA_NUM_PARALLEL=3` na części hostów, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_CONTEXT_LENGTH=4096`), a bez systemd zapisywał `~/.ollama/tuning.env`. Mógł restartować Ollamę. Skryptu nie ma już na `main`, ale zmiany zainstalowane na systemie mogą trwać dalej.

Taki tuning nie jest dowodem awarii; przy modelu 14B może jednak niepotrzebnie zwiększać presję na RAM i kolejkę zadań.

## Szybka diagnostyka na prawdziwym hoście Linux

Z katalogu bieżącego repozytorium:

```bash
bash scripts/ollama-config-doctor.sh --status
```

Bezpieczne wycofanie **wyłącznie** historycznych plików BastillaOS po decyzji operatora:

```bash
bash scripts/ollama-config-doctor.sh --restore-bastilla-tuning
```

Wersja skryptu nie usuwa Ollamy, nie wykonuje `ollama rm`, nie usuwa wag, nie zeruje `OLLAMA_MODEL`, nie zmienia sekretów i tworzy kopie zastępowanych plików. Gdy wykryje aktywną usługę systemd, przeładuje jej ustawienia i uruchomi ją ponownie; może to chwilowo przerwać generowanie.

## Ustawienia aplikacji

Nowe, ostrożniejsze wartości domyślne aplikacji (jeśli nie są nadpisane przez środowisko):

- `OLLAMA_MODEL=auto` — wykryj istniejący model (preferuj tag 14B, gdy dostępny).
- `OLLAMA_KEEP_ALIVE=5m` — bez wymuszania całodobowego utrzymywania wag w pamięci.
- `OLLAMA_NUM_PREDICT=768` domyślnie, z możliwością ręcznego zwiększenia do 3072.
- `OLLAMA_NUM_CTX=4096` — pozostaje konfigurowalne.
- `OLLAMA_NUM_THREAD` — brak wymuszonej wartości.
- `LLM_PROVIDERS=ollama,gemini` bez konieczności korzystania z Gemini. Gemini jest używane wyłącznie po skonfigurowaniu klucza i błędzie Ollamy.

Jeżeli `.env`, `.env.local`, `/etc/bastillaos/system.env`, konfiguracja usługi systemd lub ustawienia procesu zawierają już własne `OLLAMA_*`, mają pierwszeństwo przed tymi domyślnymi wartościami — aktualizacja kodu **nie resetuje** ich automatycznie. Nie nadpisuj całego pliku `.env`, gdy zawiera tajne tokeny.

## Gdy agenci pracują, ale czat nie wysyła

Agenci GitHub mogą działać niezależnie od Ollamy hosta. Odczytaj `GET /api/triad/model-status` **na faktycznym serwerze BastillaOS**. Pokazuje on osiągalność `/api/tags`, nie dowodzi generowania. W Google AI Studio `127.0.0.1:11434` oznacza środowisko serwera aplikacji, a nie komputer użytkownika. Dostęp do Ollamy z zewnątrz wymaga chronionego połączenia po stronie backendu; nie wystawiaj anonimowo portu 11434.

Po zmianach środowiska uruchom ponownie backend BastillaOS, pobierz `main` do AI Studio i wyślij najpierw jedną krótką wiadomość do Arii. Gdy Ollama jest niedostępna, a Gemini ma faktycznie skonfigurowany klucz i znajduje się w `LLM_PROVIDERS`, czat może skorzystać z fallbacku.
