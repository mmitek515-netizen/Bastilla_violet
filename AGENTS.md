# Bastilla OS / SVL_System — kontrakt współpracy czterech agentów

**Wiążące wymagania:** [pełny plan i postęp](docs/BASTILLA_MASTER_PLAN_PROGRESS_2026-11-10.md). Priorytet: **GUI i design → działający Linux/terminal → rozwój autonomii agentów**. Główna gałąź repozytorium: **`main`**.

## Agenci i tryb pracy

- **Alex, Aria, Astyria, Aurelius** mają być czterema niezależnymi agentami z osobnymi kontami Linux, pamięcią i narzędziami, ale **bez narzucania sztywnych ról**, które ograniczają im zadania. Mogą samodzielnie komunikować się z operatorem i ze sobą.
- Pliki `.github/agents/*.agent.md` konfigurują profile Copilot; nie potwierdzają istnienia niezależnych procesów. Nie udawaj aktywnych agentów tylko dlatego, że profil lub konwersacja nosi ich nazwę.
- Dla rzeczywistych workerów wymagane są PID, UID, żywy heartbeat, logi, wyniki narzędzi i możliwość zatrzymania. Statusy offline/unverified są właściwe, gdy brak dowodu działania.
- Architektura docelowa: obserwowalność sferyczna (wielokierunkowy event bus), asynchroniczne, asymetryczne i polimorficzne workery/daemony; opis tej architektury nie oznacza, że jest już wdrożona.
- Każdy z agentów może otrzymać osobne uprawnienia administracyjne na zainstalowanym hoście wyłącznie przez świadomą konfigurację i audyt. Nie deklaruj `root` na podstawie interfejsu. Nie udostępniaj nieuwierzytelnionego shell/root przez przeglądarkę ani publiczne MCP.

## Realizacja i bezpieczeństwo

1. **Najpierw GUI:** uproszczona nawigacja, gesty na Androidzie, centralny czat ChatGPT Work-like, nowy czat i historia, realne zdarzenia pracy, avatary, załączniki, rozszerzalna biblioteka interaktywnych elementów (obecnie 26 typów).
2. **Następnie runtime:** Debian 13 / KDE / ISO, działające terminale oraz użytkownicy Linux; dopiero po potwierdzeniu stanu hosta wiąż terminale i agenty z narzędziami.
3. **Potem automatyka:** Ollama, vision, render z promptów, wspólna i osobna pamięć, audytowalne zadania, samonaprawa z testami i rollbackiem, GitHub sync, MCP i diagnostyka.
4. Preferuj pracę na `main` zgodnie z preferencją właściciela, bez force push i bez nadpisywania cudzych zmian. Przed zapisem sprawdź aktualne SHA pliku i przeprowadź odpowiednie testy. Gdy narzędzie wymaga PR, zgłoś ograniczenie zamiast pozorowania merge.
5. Bez symulacji statusów, postępu, flot, statków, telemetrii i wykonanych operacji. Rozróżniaj `kod istnieje`, `CI przeszło`, `usługa uruchomiona`, `użytkownik potwierdził wynik`.
6. Nie publikuj kluczy/sekretów ani danych lokalnych. Operacje destrukcyjne, koszty i zakupy wymagają odrębnej autoryzacji operatora.
7. Każda zmiana ma zawierać ścieżki plików, commit SHA, rezultat testów, dowód działania i otwarte blokery. Nie przypisuj zasług nieuruchomionym agentom.

**Uwaga:** ta dokumentacja określa docelowe zachowanie. Sam commit nie uruchamia Linuxa, GUI w AI Studio, modeli ani niezależnych daemonów.
