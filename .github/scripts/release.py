"""Install a verified ZIP into the existing releases/current/shared layout."""

import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import stat
import subprocess
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import zipfile


def require(condition):
    if not condition:
        raise ValueError('Deployment precondition failed')


def quiet(command, cwd=None):
    environment = os.environ.copy()
    environment.pop('APP_ENV', None)
    environment.pop('APP_DEBUG', None)
    subprocess.run(command, cwd=cwd, check=True, timeout=300,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=environment)


def application(root):
    require(root.name != 'public' and (root / 'app').is_dir())
    require(not (root / 'public/public').exists())
    for name in ('artisan', 'public/index.php', 'vendor/autoload.php', '.env'):
        require((root / name).is_file() and os.access(root / name, os.R_OK))


def target(config, prepared=True):
    require(os.geteuid() != 0 and pwd.getpwuid(os.geteuid()).pw_name == config['USER'])
    base = Path(config['ROOT'])
    require(base.is_absolute() and not base.is_symlink() and base.name != 'public')
    base = base.resolve(strict=True)
    current = base / 'current'
    require(not current.exists() or current.is_symlink())
    active = current.resolve(strict=True) if current.is_symlink() else base
    require(active == base or active.parent == base / 'releases')
    application(active)
    overlay = Path.home() / '.dploy/overlays/.env'
    require(overlay.is_file() and overlay.read_bytes() == (active / '.env').read_bytes())
    quiet([config['PHP'], '-n', '-r', 'exit(PHP_MAJOR_VERSION === 8 && PHP_MINOR_VERSION === 5 ? 0 : 1);'])
    if prepared:
        require(current.is_symlink() and (base / 'releases').is_dir())
        require(not (base / 'releases').is_symlink() and not (base / 'shared').is_symlink())
        require(os.path.samefile(active / 'storage', base / 'shared/storage'))
        quiet(['sudo', '-n', '-l', '/usr/bin/systemctl', 'reload', 'php8.5-fpm.service'])
    return base, active, overlay


def prepare(config):
    base, active, overlay = target(config, prepared=False)
    require(not (base / 'releases').is_symlink() and not (base / 'shared').is_symlink())
    (base / 'releases').mkdir(exist_ok=True)
    (base / 'shared').mkdir(exist_ok=True)
    shared = base / 'shared/storage'
    require((active / 'storage').is_dir())
    if not shared.exists() or not os.path.samefile(active / 'storage', shared):
        # Keep the unused dploy copy intact; the running site's storage is authoritative.
        if shared.exists() or shared.is_symlink():
            saved = shared.with_name('storage-before-actions-' + str(time.time_ns()))
            shared.rename(saved)
        shared.symlink_to((active / 'storage').resolve(strict=True), target_is_directory=True)
    overlay.chmod(0o600)
    if not (base / 'current').is_symlink():
        (base / 'current').symlink_to('.', target_is_directory=True)
    target(config)


def unpack(archive, release, commit):
    allowed = {'app', 'bootstrap', 'config', 'database', 'public', 'resources', 'routes',
               'storage', 'vendor', 'artisan', 'composer.json', 'composer.lock', 'README.md',
               '.env.example', '.release-commit'}
    with zipfile.ZipFile(archive) as package:
        seen = set()
        require(sum(info.file_size for info in package.infolist()) <= 2 * 1024**3)
        for info in package.infolist():
            path = PurePosixPath(info.filename)
            require(info.filename and '\\' not in info.filename and not path.is_absolute())
            require('..' not in path.parts and str(path) not in seen)
            require(path.parts[0] in allowed and not stat.S_ISLNK(info.external_attr >> 16))
            require(path.parts[:2] not in (('public', 'public'), ('public', 'storage')))
            require(path.parts[0] != 'database' or len(path.parts) == 1 or path.parts[1] == 'migrations')
            require(path.parts[0] != 'resources' or len(path.parts) == 1 or path.parts[1] == 'views')
            seen.add(str(path))
        require(package.read('.release-commit').decode().strip() == commit)
        require(package.read('public/build/release.txt').decode().strip() == commit)
        for info in package.infolist():
            path = PurePosixPath(info.filename)
            if path.parts[0] == 'storage' or path.parts[:2] == ('bootstrap', 'cache'):
                continue
            package.extract(info, release)
    (release / 'bootstrap/cache').mkdir(parents=True, exist_ok=True)


def migration_changes(active, release):
    previous = {path.name: path.read_bytes() for path in (active / 'database/migrations').glob('*.php')}
    incoming = {path.name: path.read_bytes() for path in (release / 'database/migrations').glob('*.php')}
    require(all(incoming.get(name) == content for name, content in previous.items()))
    return incoming.keys() - previous.keys()


def switch(base, destination):
    link = base / '.current-actions'
    require(not link.exists() and not link.is_symlink())
    link.symlink_to(destination, target_is_directory=True)
    os.replace(link, base / 'current')


def healthy(config, commit):
    for attempt in range(5):
        try:
            for suffix in ('/build/release.txt?release=' + config['RELEASE'], '/up'):
                request = Request(config['URL'].rstrip('/') + suffix, headers={'Cache-Control': 'no-cache'})
                with urlopen(request, timeout=10) as response:
                    require(response.status == 200 and urlsplit(response.url).hostname == config['DOMAIN'])
                    if suffix.startswith('/build/'):
                        require(response.read(100).decode().strip() == commit)
            return
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2)


def upload_directory(config):
    path = Path(config['UPLOAD'])
    require(path.parent == Path(tempfile.gettempdir()) and path.name.startswith('obake-upload-'))
    require(not path.is_symlink() and path.is_dir() and path.stat().st_uid == os.geteuid())
    return path


def deploy(config):
    base, active, overlay = target(config)
    require(re.fullmatch(r'[0-9a-f]{40}', config['COMMIT']))
    require(re.fullmatch(config['COMMIT'] + r'-[0-9]+-[0-9]+', config['RELEASE']))
    archive = upload_directory(config) / 'package.zip'
    with archive.open('rb') as stream:
        require(hashlib.file_digest(stream, 'sha256').hexdigest() == config['DIGEST'])
    with (base / 'shared/.actions-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Recheck after locking in case another deployment finished while uploading.
        base, active, overlay = target(config)
        require(not (active / 'storage/framework/down').exists())
        release = base / 'releases' / config['RELEASE']
        require(not release.exists())
        release.mkdir(mode=0o755)
        unpack(archive, release, config['COMMIT'])
        (release / '.env').symlink_to(overlay)
        (release / 'storage').symlink_to(base / 'shared/storage', target_is_directory=True)
        (release / 'public/storage').symlink_to(base / 'shared/storage/app/public', target_is_directory=True)
        application(release)
        require((release / 'public/build/manifest.json').is_file())
        migrations = migration_changes(active, release)
        require(not migrations or config['MIGRATE'])
        quiet([config['PHP'], str(release / 'vendor/composer/platform_check.php')])
        quiet([config['PHP'], 'artisan', 'config:clear', '--no-ansi'], cwd=release)
        previous = os.readlink(base / 'current')
        switched = False
        maintenance = False
        try:
            if migrations:
                maintenance = True
                quiet([config['PHP'], 'artisan', 'down', '--retry=60', '--no-ansi'], cwd=active)
                quiet([config['PHP'], 'artisan', 'migrate', '--force', '--no-interaction', '--no-ansi'], cwd=release)
            quiet([config['PHP'], 'artisan', 'optimize', '--no-ansi'], cwd=release)
            switch(base, 'releases/' + config['RELEASE'])
            switched = True
            quiet(['sudo', '-n', '/usr/bin/systemctl', 'reload', 'php8.5-fpm.service'])
            if maintenance:
                quiet([config['PHP'], 'artisan', 'up', '--no-ansi'], cwd=release)
                maintenance = False
            healthy(config, config['COMMIT'])
        except Exception:
            # A schema change may be incompatible with old code: never roll it back automatically.
            if switched and not migrations:
                switch(base, previous)
                quiet(['sudo', '-n', '/usr/bin/systemctl', 'reload', 'php8.5-fpm.service'])
            raise
        finally:
            if maintenance:
                quiet([config['PHP'], 'artisan', 'up', '--no-ansi'], cwd=(base / 'current').resolve())
        # shortcut: keep previous releases; add reviewed retention only when disk use requires it.


def main(config):
    os.umask(0o022)
    mode = config['MODE']
    if mode == 'prepare':
        prepare(config)
    elif mode == 'check':
        target(config)
    elif mode == 'upload':
        target(config)
        return {'upload': tempfile.mkdtemp(prefix='obake-upload-')}
    elif mode == 'deploy':
        deploy(config)
    elif mode == 'cleanup':
        shutil.rmtree(upload_directory(config))
    else:
        raise ValueError('Unsupported operation')
    return {'status': 'OK'}


if __name__ == '__main__':
    try:
        print(json.dumps(main(globals()['CONFIG'])))
    except Exception:
        print(json.dumps({'status': 'FAIL'}))
        raise SystemExit(1)
