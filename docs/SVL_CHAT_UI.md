# SVL Chat UI — biblioteka interaktywnych elementów

Renderer: `src/components/SvlChatUi.tsx`. Komponenty są zwykłymi natywnymi elementami React, a nie obrazami lub kodem wykonanym przez model.

## Wspierane komponenty

- Marka: lightsaber, text, badge, divider
- Status: card, alert, status, metric, progress
- Akcje: button, button_group, link
- Formularze: toggle, checkbox, radio, slider, text_input, textarea, select
- Układ: tabs, accordion
- Dane: table, bar_chart, timeline
- Kod i terminal: code, terminal

## Przykład wiadomości AI

```svl-ui
{
  "title": "Panel SVL",
  "components": [
    { "type": "lightsaber" },
    { "type": "status", "label": "Ollama", "value": "NIEZWERYFIKOWANO" },
    { "type": "button", "label": "Sprawdź stan", "action": "Sprawdź rzeczywisty stan Ollamy" },
    { "type": "slider", "label": "Próg", "min": 0, "max": 100, "value": 40 }
  ]
}
```

## Ograniczenia i rzeczywiste wykonanie

- Dozwolone tylko znane typy (26). Maksymalnie 40 komponentów, 30 kB JSON.
- Brak HTML/JS/eval od modelu, a kliknięcie action wysyła do czatu nową wiadomość dopiero po interakcji użytkownika.
- Suwaki, formularze i przełączniki przechowują wartości lokalnie. Nie stanowią automatycznego sterowania systemem.
- Nie wolno wstawiać fałszywych statusów, wymyślonej telemetrii ani symulowanego postępu.
- Weryfikacja stanu hosta: endpointy API oraz panel Work Activity oparty o logi, nie na danych przykładowych.

## ChatGPT Work-style

- Główny ekran: czat oraz panel aktywności, na telefonie przesunięcie w lewo lub w prawo.
- Nowy czat zachowuje stare wiadomości w archiwum i odcina kontekst poprzedniej rozmowy dla LLM.
- Status oryginalnych workerów z /api/original-agents/status odzyskany z PR #7; profile czatu nie potwierdzają aktywności oryginalnych agentów.
- Awatary: HTTPS, plik oraz prompt dla aktualnego GPT Image, zachowywane na hoście w ~/.bastillaos/avatars.json przez chronione API.

## Testy

```bash
npm ci
npm run lint
npm test
npm run build
```

Na Androidzie sprawdź gesty, nowy czat, historię, błędy połączenia, awatary i renderowanie bloków svl-ui.