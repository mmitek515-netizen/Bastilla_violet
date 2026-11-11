#!/usr/bin/env python3
"""Real read-only snapshot of the Debian/Linux host -> Bastilla OS GUI backend.
Requires SVL_BACKEND_URL (HTTPS for external endpoints) and SVL_LINUX_SYNC_TOKEN.
No root access is required to read basic metrics. This does not synchronize host files or execute shell commands.
"""
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse


def read_text(path):
    try:
        with open(path, encoding='utf-8') as handle:
            return handle.read()
    except (OSError, UnicodeDecodeError):
        return ''


def timed(args):
    try:
        return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=5, check=False).stdout
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return ''


def sample():
    mem = {}
    for line in read_text('/proc/meminfo').splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            try:
                mem[key] = int(value.strip().split()[0])
            except (ValueError, IndexError):
                pass
    total, available = mem.get('MemTotal', 0), mem.get('MemAvailable', 0)
    memory_percent = round((1 - available / total) * 100, 1) if total else 0
    disk = shutil.disk_usage('/')
    units = timed(['systemctl', '--no-pager', '--plain', '--no-legend', '--type=service', '--all', '--no-block', 'list-units'])
    services = []
    for line in units.splitlines()[:512]:
        fields = line.strip().lstrip('●').split()
        if len(fields) >= 4 and fields[0].endswith('.service'):
            services.append({'name': fields[0], 'state': fields[2] + '/' + fields[3]})
    processes = sum(1 for item in os.listdir('/proc') if item.isdigit()) if os.path.isdir('/proc') else 0
    ollama = {'reachable': False, 'models': []}
    try:
        with urllib.request.urlopen(os.environ.get('SVL_OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/') + '/api/tags', timeout=3) as result:
            payload = json.load(result)
            ollama = {'reachable': True, 'models': [item.get('name', '') for item in payload.get('models', []) if item.get('name')][:40]}
    except (OSError, ValueError, TimeoutError):
        pass
    pretty = platform.platform()
    for line in read_text('/etc/os-release').splitlines():
        if line.startswith('PRETTY_NAME='):
            pretty = line.partition('=')[2].strip().strip('"')
    return {'scope': 'linux-host', 'hostname': platform.node(), 'os': pretty, 'kernel': platform.release(), 'uid': os.geteuid(),
            'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'memoryPercent': memory_percent,
            'diskPercent': round(disk.used / disk.total * 100, 1) if disk.total else 0,
            'processCount': processes, 'services': services, 'ollama': ollama}


def run():
    url = os.environ.get('SVL_BACKEND_URL', '').rstrip('/')
    token = os.environ.get('SVL_LINUX_SYNC_TOKEN', '')
    parsed = urlparse(url)
    if not (parsed.scheme == 'https' or (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1'))):
        sys.exit('SVL_BACKEND_URL musi używać HTTPS (lub HTTP tylko localhost).')
    if len(token) < 32:
        sys.exit('SVL_LINUX_SYNC_TOKEN musi mieć co najmniej 32 znaki.')
    interval = max(5, min(int(os.environ.get('SVL_SYNC_INTERVAL', '15')), 300))
    while True:
        try:
            req = urllib.request.Request(url + '/api/linux/ingest', data=json.dumps(sample()).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}, method='POST')
            with urllib.request.urlopen(req, timeout=12) as response:
                if response.status != 200:
                    print('HTTP', response.status, file=sys.stderr)
        except Exception as exc:
            print('Linux Sync:', type(exc).__name__, str(exc)[:180], file=sys.stderr)
        time.sleep(interval)


if __name__ == '__main__':
    run()
