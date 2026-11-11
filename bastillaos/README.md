# Bastilla OS SVL_System

**Enter hyperspace** is the application welcome screen. It opens the existing Bastilla dashboard after the user selects the button; it does not represent a bootloader or an OS installation screen.

BastillaOS is a Debian 13 (Trixie) Stable amd64 Live installer with KDE Plasma,
the Bastilla visual identity, and the existing SVL system installed as a local
system service. It is a bootable Linux distribution project, not a web-only
reskin.

## Build requirements

- Linux amd64 host (or GitHub Actions runner) with Docker Engine access,
  permission to run privileged build containers, and a glibc-based Node runtime.
- Node.js 22 or later and npm 10.5.1 or later.
- Bash, `dpkg-deb`, and `sha256sum` on the host.
- Internet access for Debian repositories, npm, and the Debian live-build
  container.
- Approximately 20 GB of free build storage; a KDE installer ISO is large.

The ISO build uses Docker so the Debian live-build tools run on Debian 13 rather
than inheriting Ubuntu or another host's build environment.

## Build an installable ISO

From the repository root:

```sh
bash bastillaos/build-iso.sh
```

The user running the build needs permission to access the Docker daemon, which
launches a privileged but disposable Debian build container. The host-side Node,
npm, and Debian package preparation do not require running `npm` as root.

The script builds the existing React application, compiles its production
server, creates the `bastillaos-system` Debian package, and builds the
Debian Live installer with the repository's live-build configuration. On
success it produces:

- `bastillaos/build/BastillaOS-13-amd64.iso`
- `bastillaos/build/BastillaOS-13-amd64.iso.sha256`

The installer image is built from the current Debian Trixie repositories,
includes KDE Plasma 6 and the official Debian live installer, and supports
amd64 UEFI and legacy BIOS boot.
The image also sets unattended Debian security upgrades, a deny-incoming UFW
firewall policy, and conservative kernel/network sysctl defaults.

GitHub Actions can build the same ISO on demand via **Build BastillaOS Debian
Live ISO → Run workflow**. Pushing a `bastillaos-v*` tag also builds and
publishes the ISO and checksum as a workflow artifact. CI does not commit
generated binaries to the source repository. The workflow frees runner disk
space and syntax/config-checks the build inputs before the full build; after a
successful build, the build script removes root-owned live-build temporaries
via the builder container. Failed builds retain that temporary tree for
diagnosis.

## Boot and install

The ISO has two separate stages: the Debian boot/install flow and the BastillaOS
application. **Enter hyperspace** is only the application's welcome screen; it
is not a boot menu, Linux login screen or installer.

### Install from USB or a virtual machine

1. Back up files from the target computer. Installing an OS can erase the
  selected disk. Keep secrets and VM disk images out of a public USB image.
2. Write `BastillaOS-13-amd64.iso` to a USB drive with a trusted image writer,
  or attach it as a virtual CD/DVD to an amd64 VM. The image supports UEFI and
  legacy BIOS. On a physical PC, use its firmware boot menu to select the USB
  device; the key and menu wording depend on the manufacturer.
3. In the Debian boot menu, start the live session. The desktop you see here is
  the installer environment; **Enter hyperspace** appears later, after opening
  the installed SVL application.
4. Open the Debian Installer from the live desktop. Follow its language,
  keyboard, time zone, network, user-account and disk setup screens. Choose
  the target disk deliberately. Selecting the whole disk replaces its
  partitions and deletes existing data; use manual partitioning only if you
  understand the layout and mount points.
5. Confirm the installer's final summary before it writes changes. Wait for
  installation to finish, reboot when prompted, and remove or disconnect the
  USB/ISO so the computer boots from the installed disk.

### First boot and opening BastillaOS

1. At the graphical login screen, select the KDE Plasma session if prompted and
  sign in with the account created during installation. The image does not
  configure automatic login.
2. Wait for the KDE desktop and network connection. The `bastillaos-system`
  service starts through systemd and listens locally at
  `http://127.0.0.1:3000`; Chromium is not configured to open automatically.
3. Open the application launcher and start **BastillaOS**. The launcher waits
  up to 30 seconds for the local service, then opens Chromium in application
  mode. The **without_nlp** menu entry opens that specific view directly.
4. On the first application launch, the **Enter hyperspace** screen appears.
  Select its enter button to open the existing SVL dashboard. The choice is
  stored in that browser profile's localStorage; clearing site data or using a
  fresh profile shows the welcome screen again.
5. Confirm the dashboard loads and inspect only the integrations needed on this
  host. Ollama, models, VM/KVM access and optional API credentials may need
  separate setup; an installed UI does not mean those services are connected.

### Service checks and recovery

Use a terminal on the installed system to inspect the application service:

```sh
sudo systemctl status bastillaos-system.service
sudo journalctl -u bastillaos-system.service -b
```

If the service is stopped after a failed start, inspect the log before
restarting it:

```sh
sudo systemctl restart bastillaos-system.service
```

The service runs as `root` because it exposes system-management operations, but
its HTTP listener is fixed to loopback (`127.0.0.1:3000`). Do not configure a
firewall or proxy to expose that endpoint to a network: any local process that
can reach it may be able to request privileged actions. The desktop launcher
reports if the service does not become ready or Chromium is missing.

For optional runtime credentials, configure
`/etc/bastillaos/system.env` as a root-owned file with mode `0600`, then restart
`bastillaos-system.service`. Do not put credentials in the ISO, Git, chat or a
world-readable file. See the [reinstallation guide](../docs/REINSTALL_BASELINE.md)
before restoring runtime data from another installation.

## without_nlp engine

The deterministic Euler & Fourier harmonic engine (`apps/without_nlp`) is
installed as a native system component by the `bastillaos-system` package:

- `/usr/bin/without-nlp` — command-line engine (Python 3 standard library
  only, no network, no NLP/LLM model). Examples:
  `without-nlp "Tekst"`, `echo Tekst | without-nlp -`,
  `without-nlp --omega 2.0 --t 0.5 Tekst`, `without-nlp --decode 0.6797`,
  `without-nlp --status`.
- KDE menu entry **without_nlp**, which opens the BastillaOS desktop directly
  on the engine view (`http://127.0.0.1:3000/?view=without_nlp`).
- The local API keeps serving `GET /api/without_nlp/status` and
  `POST /api/without_nlp/analyze`.
- Engine selection: by default only local Ollama answers
  (`LLM_PROVIDERS="ollama"`, `OLLAMA_MODEL="dolphin-llama3:8b"` selects the
  vision-capable model); cloud APIs and without_nlp are off, and a model failure returns an
  error instead of a substitute reply. `LLM_PROVIDERS="gemini,xai,ollama"`
  restores the cloud chain and `CHAT_LOCAL_FALLBACK="on"` re-enables
  without_nlp as the last resort.
- Triad chat (`POST /api/triad/message`) is free conversation with the Triad:
  Google Gemini answers first (`GEMINI_API_KEY`, primary model plus
  `GEMINI_FALLBACK_MODELS`), xAI Grok is the fallback (`XAI_API_KEY`; when
  `XAI_MODEL` is rejected the server picks a current Grok model from
  `/v1/models`). Each agent falls back independently. Without keys or when
  both APIs fail, a local Ollama model answers (`OLLAMA_MODEL`), and only
  then without_nlp answers locally and deterministically.
  Install Ollama using its trusted distribution instructions, then run
  `ollama pull dolphin-llama3:8b` to install the only recommended chat model.
  The repository contains no Ollama installer and does not write Ollama or
  system configuration. The SVL server preloads the selected model at start
  (`[OLLAMA] Model … loaded`).
- Triad mission **Optymalizacja i konfiguracja Ollamy** (`POST
  /api/astyria/mission` with `{"action":"ollama_optimize"}`, also in the
  mission selector): the server warms the model, measures tokens/s, and
  collects version, models, memory placement and host resources; Alex
  (infrastructure), Astyria (performance) and Aurelius (stability/security)
  each post a report with rule-based recommendations plus a short model
  comment. Recommended commands are shown to the operator and are never run
  automatically; commands in model comments are dropped. Put the
  keys in `/etc/bastillaos/system.env` (root-owned, `chmod 0600`).

The Python and TypeScript engines encode Unicode code points identically, so
the CLI, API and desktop view return the same coefficients and harmonics.

## Deterministic agent protocol

The local Triad command interface uses `POST /api/triad/command`. It accepts
only the finite, structured command set declared in
`src/kernel/agentProtocol.ts`: `SYSTEM_STATUS`, `DATA_STORE_AUDIT`,
`VERSION_TIMELINE`, and `SIGNAL_ANALYSIS`. Requests include an `agent` value
(`triad`, `Alex`, `Astyria`, or `Aurelius`); signal analysis also requires a
typed `payload.signal` and accepts optional numeric `omega` and `time` fields.
Unknown commands and fields are rejected. The protocol does not interpret
free-form instructions or require a generative text provider. Successful
responses contain structured agent replies and the resulting system state;
the application persists the protocol transcript.

## Preserved SVL functionality

The fresh-install welcome screen is part of the React frontend and is included by the ordinary `npm run build` step in the ISO build. It does not change the Linux login screen, boot menu, kernel privileges, or service permissions.


The Debian package carries the existing built web system and writable runtime
data, including the deterministic Triad command interface, Astyria mission
tooling, terminal, system diagnostics and telemetry, kernel and DATA_STORE,
history and snapshots, file explorer, Apps Studio, without_nlp engine, 3D
visualizations, image generation, and GitHub integration. The service binds to
loopback only. Existing app data is preserved when the Debian package is
upgraded.
