# Bastilla OS — pełna biblioteka interaktywnych elementów czatu

## Architektura
Wiadomości agentów Aria, Alex, Astyria i Aurelius zawierają zwykły tekst
Markdown i opcjonalne bloki kodu `svl-ui` z bezpiecznym JSON. `SvlChatUi.tsx`
i `SvlUiExtras.tsx` renderują komponenty React bez wykonywania HTML
lub JavaScript dostarczonego przez AI. Kliknięcia z akcją wysyłają
wiadomość do czatu, nie uruchamiają kodu hosta.

Wszystkie typy znajdziesz pod **Biblioteka elementów AI** bezpośrednio
nad polem wiadomości. Są wyszukiwalne i podzielone na kategorie.
Agent otrzymuje instrukcję z listą komponentów w `server.ts`.

## Kategorie
- Tekst i formatowanie: Markdown, etykiety `badge`, `chip`,
  `chip_group` (niebieskie etykiety na ciemnym tle), cytaty, nagłówki,
  powiadomienia, karty, avatary, breadcrumbs, kod i LaTeX.
- Dane: tabele, siatki, metryki, statusy, wskaźniki, postęp,
  osie czasu, listy, wykresy liniowe, obszarowe, udziałowe, pierścieniowe,
  punktowe, histogramy, sparklines i heatmaps.
- Interakcje: przyciski, grupy, checkboxy, suwaki, przełączniki,
  formularze tekstowe, numeryczne, wyszukiwanie, daty, wybór,
  multi-select, zakładki i akordeony.
- Linux i misje: karty agentów, workerów SPAA, usług, floty, projektów,
  baz danych, misji, plików, logów, terminali i różnic kodu.
- Media: obrazy, wideo i `image_prompt` z manualnym renderowaniem
  przez rzeczywiste OpenAI Images API.

### Przykład: niebieskie etykiety
```svl-ui
{"title":"Moduły Bastilla OS","components":[{"type":"chip_group","options":["Flota","HyperCom","Ollama","SPAA","Dane"]}]}
```

### Przykład: panel systemowy
```svl-ui
{"title":"Diagnostyka","components":[
  {"type":"status","title":"Ollama","status":"NIEZWERYFIKOWANO"},
  {"type":"agent_card","title":"Aria","status":"NIEZWERYFIKOWANO"},
  {"type":"button","label":"Sprawdź przez API","action":"Sprawdź rzeczywisty stan Ollama i agentów"}
]}
```

### Przykład: prompt grafiki AI
```svl-ui
{"title":"Wizualizacja misji","components":[{"type":"image_prompt","title":"Render statku","value":"Detailed realistic concept art of a dark science fiction exploration ship, cyan lighting, black background"}]}
```

Generacja wymaga świadomego kliknięcia **Wygeneruj obraz**, działającego
backendu, uprawnionego `SVL_AI_ACCESS_TOKEN`, `OPENAI_API_KEY` i dostępu
do modelu wskazanego przez `OPENAI_IMAGE_MODEL`. DALL-E 3 nie jest dostępny
w API od 2026-05-12. Aktualna konfiguracja korzysta z GPT Image.
Bez odpowiedzi z serwera obraz nie może być oznaczony jako wygenerowany.

## Zasady
- Nie przedstawiaj danych z katalogu/demo jako rzeczywistej telemetrii.
- Nie opieraj statusu procesu, modelu lub agenta na wygenerowanym tekście.
- Żaden komponent nie wykonuje automatycznie komend Linux/root.
- Dane wejściowe są ograniczane przez `validateSvlUiDocument`.
- Obsługa `image_prompt` wymaga akcji użytkownika.
- Nowa treść AI nie oznacza automatycznie aktualizacji kodu ani instalacji
  pakietów na hoście.
- Testy: `npm test`, `npm run lint`, `npm run build`.

## Rzeczywiste granice
Biblioteka obejmuje wszystkie typy w `SVL_UI_TYPES`, ale nie zawiera
edytora działających aplikacji, dowolnego HTML ani sandboxa JS z promptu.
Wykresy renderują dane wejściowe, a nie fikcyjne wyniki API.
