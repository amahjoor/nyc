"""Create or reuse the NYC friends-playtest Droplet in an authenticated doctl context."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess

NAME = 'concrete-jungle-lobby-nyc'
REGION = 'nyc3'
SIZE = 's-1vcpu-1gb'
HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create', action='store_true', help='Apply the plan using the concrete-jungle doctl context')
    args = parser.parse_args()
    print(f'{NAME}: NYC3, {SIZE}, Ubuntu 24.04, $6/month plus applicable transfer and taxes.', flush=True)
    if not args.create:
        return
    key = Path.home() / '.ssh/id_ed25519_concrete_jungle'
    key.parent.mkdir(mode=0o700, exist_ok=True)
    with (key.parent / '.concrete-jungle-provision.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        provision(key)


def provision(key):
    cli = os.environ.get('DOCTL') or shutil.which('doctl') or HERE.parents[2] / 'output/steam/tools/doctl'

    def api(*argv):
        result = subprocess.run([cli, '--context', 'concrete-jungle', '--output', 'json', *argv],
                                capture_output=True, text=True)
        if result.returncode:
            raise SystemExit(result.stderr.strip() or result.stdout.strip() or "doctl failed")
        return json.loads(result.stdout)

    droplets = [d for d in api('compute', 'droplet', 'list') if d['name'] == NAME]
    if len(droplets) > 1:
        raise SystemExit('Multiple Droplets have the pilot name. Inspect the account before continuing.')
    if droplets:
        host = droplets[0]
        if host['region']['slug'] != REGION or host['size_slug'] != SIZE:
            raise SystemExit('An existing Droplet with the pilot name uses a different region or plan.')
        if not key.is_file():
            raise SystemExit('The pilot exists. Use its original SSH identity to deploy.')
    else:
        if not key.is_file():
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-f', str(key), '-N', '', '-C', NAME], check=True)
        public = key.with_suffix('.pub').read_text().strip()
        keys = api('compute', 'ssh-key', 'list')
        matching = next((k for k in keys if k['public_key'].split()[:2] == public.split()[:2]), None)
        if matching is None:
            matching = api('compute', 'ssh-key', 'create', NAME, '--public-key', public)[0]
        host = api('compute', 'droplet', 'create', NAME, '--region', REGION, '--size', SIZE,
                   '--image', 'ubuntu-24-04-x64', '--ssh-keys', str(matching['id']),
                   '--enable-monitoring', '--user-data-file', str(HERE / 'bootstrap.sh'), '--wait')[0]
    address = next((ip['ip_address'] for ip in host['networks']['v4'] if ip['type'] == 'public'), None)
    if not address:
        raise SystemExit(f"Droplet {host['id']} has no public IPv4 yet. Rerun to inspect it.")
    print(f"Droplet {host['id']} · {address}\nSSH identity: {key}")


if __name__ == '__main__':
    main()
