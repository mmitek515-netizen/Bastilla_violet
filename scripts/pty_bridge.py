#!/usr/bin/env python3
"""
Real Linux PTY bridge for Bastilla OS WebSocket terminals.
Spawns a real pseudo-terminal (pty.openpty) for:
  - bash (/bin/bash --norc -i)
  - python (python3 -i with svl_core preloaded)
  - codex (codex CLI)
  - admin (authenticated administrative bash shell)
"""
import os
import pty
import select
import signal
import struct
import fcntl
import termios
import subprocess
import sys

def set_winsize(fd: int, rows: int, cols: int) -> None:
    try:
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        pass

def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "bash"
    cwd = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()

    if mode == "python":
        cmd = [
            "python3",
            "-i",
            "-c",
            (
                "import sys, json, math; "
                "from svl_core import SVLSystemKernel, TopologicalInfinityEngine, SVLProtectedVariable, VisualScope; "
                "kernel = SVLSystemKernel(); "
                "print('=== SVL Python Interactive Kernel (' + kernel.sys_version.value + ') ==='); "
                "print('Operator:', kernel.operator.value, '| Metric C:', TopologicalInfinityEngine(float(\"-inf\"), float(\"inf\")).calculate_metric_c()); "
                "print('Dostępny obiekt: kernel.generate_system_status_report()')"
            ),
        ]
    elif mode == "codex":
        codex_bin = "/usr/local/bin/codex" if os.path.exists("/usr/local/bin/codex") else "./node_modules/.bin/codex"
        cmd = [
            "/bin/bash",
            "--norc",
            "-c",
            (
                f"echo '=== OpenAI Codex CLI Terminal ==='; "
                f"{codex_bin} --version 2>&1; "
                f"{codex_bin} login status 2>&1 || true; "
                f"echo 'Aby zalogować konto ChatGPT bez klucza API, wpisz: codex login --device-auth'; "
                f"PS1='codex@debian13:\\w\\$ ' exec /bin/bash --norc -i"
            ),
        ]
    elif mode == "admin":
        cmd = [
            "/bin/bash",
            "--norc",
            "-c",
            (
                "echo '=== Terminal Administracyjny (Kontrolowane Sudo / Audyt) ==='; "
                "id; uname -a; "
                "PS1='root-admin@bastilla-os:\\w# ' exec /bin/bash --norc -i"
            ),
        ]
    else:
        cmd = [
            "/bin/bash",
            "--norc",
            "-c",
            (
                "echo '=== Bastilla OS · Linux Bash PTY ==='; "
                "uname -sr; "
                "PS1='operator@bastilla-debian13:\\w\\$ ' exec /bin/bash --norc -i"
            ),
        ]

    master_fd, slave_fd = pty.openpty()
    set_winsize(master_fd, 32, 110)

    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["LANG"] = "C.UTF-8"

    proc = subprocess.Popen(
        cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=cwd,
        env=env,
        preexec_fn=os.setsid,
        close_fds=True,
    )
    os.close(slave_fd)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    try:
        while proc.poll() is None:
            rlist, _, _ = select.select([master_fd, stdin_fd], [], [], 0.2)
            if master_fd in rlist:
                try:
                    data = os.read(master_fd, 8192)
                    if not data:
                        break
                    os.write(stdout_fd, data)
                except OSError:
                    break
            if stdin_fd in rlist:
                try:
                    incoming = os.read(stdin_fd, 4096)
                    if not incoming:
                        break
                    os.write(master_fd, incoming)
                except OSError:
                    break
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        if proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except OSError:
                pass

if __name__ == "__main__":
    main()
