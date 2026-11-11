# BastillaOS — separate Linux accounts and tools for AI agents

## Implemented in the Debian system package

The `bastilla-agent-accounts` CLI is installed as `/usr/bin/bastilla-agent-accounts`.
The Debian package post-install script runs `provision`, creating the following
**real Linux accounts on the installed Debian host**, if they do not exist:

| Agent | Linux login | Home |
| --- | --- | --- |
| Alex | `bastilla-alex` | `/home/bastilla-alex` |
| Aria | `bastilla-aria` | `/home/bastilla-aria` |
| Astyria | `bastilla-astyria` | `/home/bastilla-astyria` |
| Aurelius | `bastilla-aurelius` | `/home/bastilla-aurelius` |

Each new account has a unique Unix UID, a private 0700 home directory, a locked
password, and membership in the `bastilla-agents` group. Existing accounts
are preserved rather than overwritten. They are not additional UID-0
identities; Linux has one effective root identity.

## Administrator setup

```bash
sudo bastilla-agent-accounts status
sudo bastilla-agent-accounts provision
sudo bastilla-agent-accounts run alex -- id
sudo bastilla-agent-accounts run astyria -- bash -lc 'pwd; whoami'
```

Provisioning never silently enables root access. For fully privileged work,
the host administrator **explicitly** enables passwordless `sudo` for all four
accounts (this is high-risk and allows any program running as those users to
modify the entire host):

```bash
sudo bastilla-agent-accounts grant-root --confirm FULL_ROOT_FOR_FOUR_AGENTS
sudo bastilla-agent-accounts run alex -- sudo -n id
sudo bastilla-agent-accounts revoke-root
```

The grant is in `/etc/sudoers.d/90-bastilla-ai-agents`, owned by root,
mode 0440, validated with `visudo`. Revocation removes only this rule.
Audit agent commands with system logs (`journalctl -t bastilla-agent-accounts`)
and maintain backups. This tool logs the initial executable name, not a
full command recording, so it is **not a complete security audit**.

Do not expose the BastillaOS root service / HTTP API to the internet or a
shared network. Do not automatically give downloaded model output access to
unrestricted sudo: connect a reviewed task runner and authenticate the
operator first. The installer configures accounts only, not chat sessions or
long-running independent LLM processes.

## Capability targets — status matters

- **Existing application surface:** terminal, file explorer, diagnostics,
  GitHub integration, Ollama and Gemini integration code, MCP bridge, chat,
  memory/vision components, activity log.
- **New host-level capability:** separate Linux identities and command execution
  through `runuser` using the administrator-operated CLI.
- **Next, not implemented by this change:** individual worker services,
  per-agent queues, authenticated dispatch from GUI to the correct UID,
  persistent agent-to-agent communication, tool permissions and rich activity
  streams. No mocked success or fictitious `online` statuses.
- **Future tool catalogue:** git/gh, shell/Python, package manager, files,
  systemd/journalctl, container tools, network diagnostics, browser automation,
  MCP tools, vision and image processing, code review/tests, memory, metrics.
  Each tool must be discovered on the real host and report unavailable when
  absent.

## Development order

1. GUI first: full-screen two-way chat, compact navigation, touch gestures,
   purple theme, avatars, functional rich blocks and real statuses.
2. Bind the four provisioned Linux accounts to authenticated execution and
   real model backends. Add explicit privilege elevation and audit.
3. Autonomous improvement: bounded jobs, tests, rollback, GitHub `main`
   synchronization, visibility and emergency stop.

A committed installer does **not** prove the package has been installed on
a running Debian machine. Confirm locally using `id bastilla-alex` and
`bastilla-agent-accounts status`.
