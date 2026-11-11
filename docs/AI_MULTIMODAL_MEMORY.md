# Real Vision, renderowanie GPT Image i wspólna pamięć AI — SVL_System

**Elementy wdrożone w kodzie:** backend w src/lib/aiRuntimeRoutes.ts, magazyn w src/kernel/systemMemory.ts, panel w src/components/AiCapabilitiesView.tsx, integracja agentów w server.ts. Zapis w GitHub nie dowodzi działania usług na konkretnej instalacji Linux.

## Uruchomienie na hoście Linux / Codespaces

Instalacja zależności i modeli na prawdziwym hoście:

    npm ci
    test -f .env || cp .env.example .env
    ollama list
    ollama show "<dokładna-nazwa-twojego-modelu-14b>"
    # opcjonalnie do wyszukiwania semantycznego:
    ollama pull nomic-embed-text
    npm run dev

Nie pobieraj osobnego modelu 11B, jeśli już masz działający 14B obsługujący obrazy. Dokładna nazwa modelu nie musi zawierać słowa Vision. Sprawdź, czy Ollama zgłasza zdolność vision w polu capabilities — jest to właściwość interfejsu, nie nazwa modelu. Model 14B potrzebuje odpowiednich zasobów RAM/VRAM. Sam podgląd w Google AI Studio nie instaluje Linux ani modeli; usługę Ollama należy uruchomić na Linux i podłączyć backend po prywatnym połączeniu.

## Konfiguracja środowiska

Uzupełnij własny lokalny plik .env, nigdy nie publikuj go w Git:

    OLLAMA_BASE_URL="http://127.0.0.1:11434"
    OLLAMA_MODEL="auto"
    OLLAMA_VISION_MODEL="auto"
    OPENAI_API_KEY=""
    OPENAI_IMAGE_MODEL="gpt-image-2.6-sunburst"
    SVL_MEMORY_DIR=""
    SVL_MEMORY_AUTOSAVE="on"
    SVL_MEMORY_EMBED_MODEL="nomic-embed-text"
    SVL_AI_ACCESS_TOKEN=""

- DALL-E 3 został wycofany 12 maja 2026 r.; zamiast niego wdrożony renderer wykorzystuje aktualny OpenAI Images API oraz gpt-image-2.6-sunburst (model szczegółowego renderowania, z opcją wyboru innego modelu przez .env). Konieczny jest dostęp do modelu, ważny klucz OpenAI API i rozliczanie API.
- Analiza obrazów wysyła obraz base64 w faktycznym żądaniu POST /api/chat do Ollamy. Automatyczna selekcja preferuje pobrany model 14B uncensored, nawet jeśli jego nazwa nie zawiera Vision. Wymaga potwierdzenia obsługi obrazów przez /api/show; gdy tego nie ma, serwer zwróci rzeczywisty błąd zamiast udawać analizę. Model powinien widnieć w wyniku ollama list.
- Pamięć jest plikiem JSON zapisywanym atomowo z uprawnieniami 0600. Domyślny katalog to ~/.local/share/bastillaos/ dla użytkownika backendu. SVL_MEMORY_DIR może wskazywać inny katalog. Kopie zapasowe przygotowuje administrator hosta.
- Jeśli SVL_MEMORY_EMBED_MODEL jest ustawiony i model embeddings działa w Ollama, wyszukiwanie ma ranking semantyczny. Jeśli embeddings nie odpowie, pozostaje rzeczywiste wyszukiwanie tekstowe. Nie jest to trenowanie wag LLM.
- SVL_MEMORY_AUTOSAVE=on zapisuje udane epizody czatu (wiadomość operatora i fragment rzeczywistej odpowiedzi); pomija załączniki i komendy z prefiksem /. Można go wyłączyć przez off. Nie wklejaj sekretów do czatu. Filtr redaguje część formatów tokenów, ale nie zastępuje ochrony informacji poufnych.
- W środowisku produkcyjnym bez SVL_AI_ACCESS_TOKEN API multimodalne odrzuca wszystkie żądania, w tym lokalne. Tylko w nieprodukcyjnym trybie developerskim akceptuje bez tokenu bezpośrednie połączenia na localhost. Dla dostępu przez przeglądarkowy zdalny podgląd ustaw silny, losowy token na serwerze i wprowadź go w panelu SVL. Używaj HTTPS. Nie publikuj niezabezpieczonego portu Ollama.

## Panel w interfejsie

Nowa zakładka **Real Vision · Render · Pamięć AI** zawiera trzy rzeczywiste narzędzia:

1. Analizę JPG/PNG/WEBP (maksymalnie 8 MiB) przez model Ollama Vision.
2. Render pojedynczego obrazu PNG przez OpenAI Images API z przyciskiem zapisu.
3. Zapisywanie, odczytywanie, wyszukiwanie oraz kasowanie wspomnień globalnych i agentowych.

Agenci podczas rozmowy odczytują dopasowane globalne wspomnienia i własne wspomnienia indywidualne jako niezaufane dane kontekstowe, a nie jako polecenia do wykonania.

## Endpoints REST

Wszystkie endpointy są pod ścieżką /api/ai/runtime i wymagają dostępu lokalnego lub nagłówka x-svl-ai-token przy skonfigurowanym tokenie.

| Metoda | Endpoint | Opis |
|---|---|---|
| GET | /status | Połączenie i model Ollama, liczba zapisów pamięci, obecność klucza OpenAI (bez fikcyjnej weryfikacji klucza) |
| POST | /vision/analyze | JSON: image (data URI/base64), prompt |
| POST | /images/generate | JSON: prompt, size (1024x1024 / 1536x1024 / 1024x1536) |
| GET | /memory?scope=all | Lista wspomnień |
| GET | /memory/search?q=...&scope=global | Wyszukiwanie |
| POST | /memory | JSON: text, scope, kind |
| DELETE | /memory/:id | Trwałe usunięcie wpisu |

Zakresy: global, agent:Aria, agent:Alex, agent:Astyria, agent:Aurelius. Wyszukiwanie z scope=all jest dostępne operatorowi w panelu; kontekst modelu używa wyłącznie wpisów globalnych i właściwego agenta.

## CLI dostępne systemowo

Pakiet Debian BastillaOS instaluje również polecenie /usr/bin/svl-ai. Korzysta ono z dokładnie tego samego backendu i trwałego magazynu pamięci co GUI.

Przykłady (na hoście z działającym backendem):

    svl-ai status
    svl-ai remember global "Pracujemy na GitHub main"
    svl-ai recall "GitHub main" all
    svl-ai list global
    svl-ai vision "/home/user/zdjecie.jpg" "Co widzisz?"
    svl-ai render "Mapa układu słonecznego" "/home/user/mapa.png"

Aby połączyć się z backendem uruchomionym w innej lokalizacji, ustaw SVL_AI_API_URL na pełny adres HTTPS i SVL_AI_ACCESS_TOKEN na rzeczywisty sekret skonfigurowany w procesie backendu. Nie przekazuj tokenów jako argumentów poleceń ani nie commituj ich w GitHub. W środowisku produkcyjnym SVL_AI_ACCESS_TOKEN jest wymagany nawet dla lokalnego klienta, a panel zdalny wymaga poprawnego tokenu; nie ma anonimowego wyjątku przez reverse proxy.

Na instalacji systemd: klucz umieść w /etc/bastillaos/system.env z uprawnieniami 0600, po czym wykonaj restart usługi. Do własnej sesji CLI podaj token bezpieczną metodą administracyjną. Przechowywanie danych na hoście nie zastępuje kopii zapasowej.

## Testy i granice

    npm test
    npm run lint
    npm run build
    npm run build:server
    curl --fail http://127.0.0.1:3000/api/ai/runtime/status
    ollama list

Weryfikacja samego kodu nie oznacza potwierdzenia uruchomienia modeli. Model Vision należy przetestować rzeczywistym zdjęciem, OpenAI rzeczywistym generowaniem, a pamięć odczytem po restarcie serwera. rendering.configured=true oznacza tylko obecność klucza, nie ważność billing/API.

Integracja nie zmienia jądra Linux, nie uruchamia daemonów systemd ani nie daje automatycznie root procesom systemowym. Dostarcza wspólny magazyn dla agentów backendu SVL i chronione API dla innych usług, które można jawnie podłączyć.
