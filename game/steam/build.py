"""Stage the checksum-verified upstream Electron runtime and playable game for SteamPipe."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import tempfile
from urllib.parse import urlsplit
from urllib.request import urlopen
from zipfile import ZipFile

GAME = Path(__file__).resolve().parents[1]
OUT = GAME.parent / 'output' / 'steam'
VERSION = '45.4.1'
RUNTIMES = {
    'windows': ('win32', '2ba6223afa9121f42831fefe92c434334907540165294fc56697449d12e7cfe9', 'electron.exe', 'ConcreteJungle.exe'),
    'linux': ('linux', 'e1d077c7a087d7e344350ea0c5cd2b7dc5af3d9bf7979474f38e0fc1a560b875', 'electron', 'concrete-jungle'),
}
# Keep city data used during gameplay, including the Meadow Lake road pilot.
EXCLUDE = {'logos', 'gta-wordmark.png', 'render-lab', 'human-lab.html',
           'reconstruction.html', 'road-pilot-review.html',
           'charles-seated-wide.webp','charles-seated-close.webp','charles-standing.webp'}

def ignore(path, names):
    excluded = EXCLUDE.intersection(names)
    if Path(path) == GAME / 'dist/human/tex':
        excluded.add('archive')
    return excluded

def runtime(platform):
    os_name, checksum, _, _ = RUNTIMES[platform]
    name = f'electron-v{VERSION}-{os_name}-x64.zip'
    path = OUT / 'runtime' / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
            partial = Path(temp.name)
            try:
                with urlopen(f'https://github.com/electron/electron/releases/download/v{VERSION}/{name}', timeout=120) as source:
                    shutil.copyfileobj(source, temp)
            except BaseException:
                partial.unlink(missing_ok=True)
                raise
        partial.replace(path)
    with path.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest() != checksum:
            raise ValueError(f'Checksum mismatch for {path}. Remove the cached file and rebuild.')
    return path

def replace_directory(staged, target):
    previous = staged.parent / 'previous'
    if target.exists():
        target.rename(previous)
    try:
        staged.rename(target)
    except BaseException:
        if previous.exists():
            previous.rename(target)
        raise

def stage_app(app, lobby_url):
    app.mkdir()
    manifest = json.loads((GAME / 'package.json').read_text(encoding='utf-8'))
    (app / 'package.json').write_text(json.dumps(dict(name=manifest['name'], productName='Concrete Jungle',
                                                      version=manifest['version'], main='main.cjs'), indent=2))
    shutil.copy2(GAME / 'steam/main.cjs', app)
    shutil.copytree(GAME / 'dist', app / 'dist', ignore=ignore)
    (app / 'dist/release-mode.js').write_text('export const publicBuild = true;\n', encoding='utf-8')
    (app / 'dist/lobby-config.json').write_text(json.dumps({'url':lobby_url}))
    shutil.copy2(GAME / 'steam/artwork/client-icon.png', app / 'dist/assets/favicon.png')
    # Retain only public-facility contacts in distributed phone data.
    contacts = app / 'dist/map-contacts'
    cells = []
    for cell in sorted(contacts.glob('*.json')):
        if cell.name == 'index.json':
            continue
        public = [r for r in json.loads(cell.read_bytes()) if 'facilities' in r.get('sources', [])]
        if public:
            cell.write_text(json.dumps(public, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            cells.append(cell.stem)
        else:
            cell.unlink()
    (contacts / 'index.json').write_text(json.dumps({'cells':cells}))
    # Hide developer-only gallery links in the installed pause menu.
    index = app / 'dist/index.html'
    html = index.read_text(encoding='utf-8')
    html = re.sub(r'\s*<a class="pause-option" href="\./(?:render-lab/|reconstruction\.html|road-pilot-review\.html)".*?</a>', '', html, flags=re.S)
    html = html.replace('<p class="pause-group">How it was built</p>', '')
    html = re.sub(r' <a href="\./(?:reconstruction|road-pilot-review)\.html(?:#[^"]*)?"[^>]*>[^<]*</a>\.', '', html)
    html = html.replace('Signs show trade names only, in plain lettering.', 'Commercial signs use fictional names.')
    index.write_text(html, encoding='utf-8')
    # Include source and attribution notes alongside the runtime notices.
    credits = app / 'credits'
    credits.mkdir()
    for path in ['README.md', 'docs/people.md', 'docs/vehicles.md', 'docs/road-pilot.md']:
        shutil.copy2(GAME / path, credits)

def build(platform, lobby_url):
    archive = runtime(platform)
    destinations = OUT / 'depots'
    destinations.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destinations) as temp:
        depot = Path(temp) / platform
        with ZipFile(archive) as bundle:
            for info in bundle.infolist():
                file = Path(bundle.extract(info, depot))
                mode = stat.S_IMODE(info.external_attr >> 16)
                if mode and platform == 'linux':
                    file.chmod(mode)
        _, _, original, launcher = RUNTIMES[platform]
        (depot / original).rename(depot / launcher)
        (depot / 'resources/default_app.asar').unlink(missing_ok=True)
        app = depot / 'resources/app'
        stage_app(app, lobby_url)
        target = destinations / platform
        replace_directory(depot, target)
        print(target / launcher, flush=True)

def steam_id(value):
    if not re.fullmatch(r'[1-9][0-9]{0,9}', value) or int(value) > 4294967295:
        raise argparse.ArgumentTypeError('Enter a positive Steamworks ID')
    return value

def manifests(ids, preview, mac_depot=None):
    app_id, *depots = ids
    targets = [(depot_id, f'depots/{platform}', RUNTIMES[platform][3]) for platform, depot_id in zip(RUNTIMES, depots)]
    if mac_depot:
        targets.append((mac_depot, 'macos/Concrete Jungle-darwin-universal', 'Concrete Jungle.app/Contents/MacOS/Concrete Jungle'))
    if len({target[0] for target in targets}) != len(targets):
        raise ValueError('Each platform needs a separate depot')
    out = OUT / 'scripts'
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    for depot_id, folder, launcher in targets:
        if not (OUT / folder / launcher).is_file():
            raise ValueError(f'Build {folder} first')
    for depot_id, folder, _ in targets:
        name = f'depot_{depot_id}.vdf'
        (out / name).write_text(f'''"DepotBuild"
{{
    "DepotID" "{depot_id}"
    "ContentRoot" "../{folder}"
    "FileMapping"
    {{
        "LocalPath" "*"
        "DepotPath" "."
        "Recursive" "1"
    }}
}}
''')
        entries.append(f'        "{depot_id}" "{name}"')
    data = '\n'.join(entries)
    path = out / f'app_{app_id}.vdf'
    path.write_text(f'''"AppBuild"
{{
    "AppID" "{app_id}"
    "Desc" "Concrete Jungle review build"
    "BuildOutput" "../logs"
    "ContentRoot" "../depots"
    "Preview" "{int(preview)}"
    "Depots"
    {{
{data}
    }}
}}
''')
    print(path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=[*RUNTIMES, 'macos', 'all'], default='all')
    parser.add_argument('--vdf', nargs=3, type=steam_id, metavar=('APP', 'WINDOWS_DEPOT', 'LINUX_DEPOT'))
    parser.add_argument('--mac-depot', type=steam_id, help='Include the staged universal macOS app in the SteamPipe build')
    parser.add_argument('--preview', action='store_true', help='Generate a SteamPipe dry-run manifest')
    parser.add_argument('--lobby-url', default='', help='Public WSS lobby URL baked into the clients')
    args = parser.parse_args()
    if args.lobby_url:
        address = urlsplit(args.lobby_url)
        if address.scheme != 'wss' or not address.hostname or address.username or address.password or address.query or address.fragment:
            parser.error('--lobby-url requires a public wss:// address')
    if args.mac_depot and not args.vdf:
        parser.error('--mac-depot requires --vdf')
    if args.vdf:
        manifests(args.vdf, args.preview, args.mac_depot)
    elif args.platform == 'macos':
        OUT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=OUT) as temp:
            staged = Path(temp) / 'mac-source'
            stage_app(staged, args.lobby_url)
            replace_directory(staged, OUT / 'mac-source')
        print(OUT / 'mac-source')
    else:
        for platform in (RUNTIMES if args.platform == 'all' else [args.platform]):
            build(platform, args.lobby_url)
        # A web host can serve the same public client to compatible WebGL2 browsers.
        source = OUT / 'depots' / platform / 'resources/app/dist'
        with tempfile.TemporaryDirectory(dir=OUT) as temp:
            web = Path(temp) / 'web'
            shutil.copytree(source, web)
            target = OUT / 'web'
            replace_directory(web, target)
