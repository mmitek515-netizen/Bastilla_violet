# AI Desktop Nexus — zdalny pulpit Debiana 13 (Xvfb/XFCE/noVNC)

## Stan funkcji
Kod w `src/lib/aiDesktopRoutes.ts` odczytuje rzeczywisty stan
`/tmp/.X11-unix/X99` i lokalnych portów 5901/6080 z perspektywy procesu
backendu. W `AI → AI Desktop Nexus` widoczna jest diagnostyka.
Dostępność portu **nie dowodzi** przeprowadzenia autoryzacji, obecności
agentów w sesji, wyświetlenia obrazu ani wykonania zadania.
Stary statyczny widok z komunikatami ONLINE został usunięty z seeda aplikacji.

## Instalacja na rzeczywistym Debianie 13
Instalacja jest świadomym działaniem administratora na hoście Linux.
Podgląd Google AI Studio nie ma własnego hosta X11, VNC ani uprawnień root.

```bash
bash scripts/install-ai-desktop.sh --verify
bash scripts/install-ai-desktop.sh --dry-run
sudo bash scripts/install-ai-desktop.sh --install
```

Zwykły użytkownik Linux (bez sudo) musi przygotować zabezpieczone hasło
i uruchomić sesję. W żadnym miejscu nie przekazuj hasła w URL ani Git:

```bash
mkdir -p ~/.vnc && chmod 700 ~/.vnc
x11vnc -storepasswd ~/.vnc/passwd
chmod 600 ~/.vnc/passwd
bash scripts/start-ai-desktop.sh
```

Skrypt używa Xvfb :99, XFCE4, x11vnc nasłuchującego tylko na localhost
i websockify/noVNC nasłuchującego tylko na localhost. **Portu 5901 ani 6080
nie należy wystawiać publicznie bez chronionego tunelu**.

## Połączenie z telefonu
Zastosuj prywatny tunel HTTPS/SSH lub prywatne przekierowanie portów,
które wymaga uwierzytelnienia. Zapisz publiczny adres HTTPS
tej bramki po stronie backendu:

```dotenv
SVL_DESKTOP_WEB_PORT=6080
SVL_DESKTOP_VNC_PORT=5901
SVL_DESKTOP_VIEWER_URL=https://twoja-prywatna-bramka.example/vnc.html
```

Panel pokazuje odnośnik tylko przy skonfigurowanym poprawnym HTTPS oraz
wykryciu lokalnej sesji. Sam adres HTTPS nie dowodzi, że tunel działa.

## Dostęp agentów AI
Zdalny pulpit jest nowym rzeczywistym narzędziem **operatora**.
Robotyczne sterowanie myszą/klawiaturą, dostęp agentów do pulpitu,
odczyty obrazu i automatyczne sesje wymagają osobnej autoryzowanej
integracji, logów i weryfikacji tożsamości agentów. Obecne API
zawsze zwraca `agentControlVerified:false`.
Nie przypisuj agentom aktywności wyłącznie na podstawie ich nazw
w aplikacji ani wirtualnego pulpitu.

## Diagnostyka
```bash
curl --fail http://127.0.0.1:3000/api/ai/desktop/status
ss -ltn | grep -E ':5901|:6080'
```

Po restarcie wymagane jest ponowne uruchomienie sesji lub skonfigurowanie
nadzorowanej usługi systemd użytkownika (po ocenie bezpieczeństwa hosta).
Nie ma automatycznej ekspozycji VNC, wykonania poleceń root ani fikcyjnych
okien agentów.
