"""Download the artifact of a successful main CI run, then install it over SSH."""

import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit


def require(condition):
    if not condition:
        raise ValueError('Deployment precondition failed')


def api(path):
    result = subprocess.run(['gh', 'api', path], check=True, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout)


def require_current_main(repository, commit):
    require(api(f'repos/{repository}/commits/main')['sha'] == commit)


def artifact(repository, run_id, commit):
    require(re.fullmatch(r'[0-9]+', run_id))
    run = api(f'repos/{repository}/actions/runs/{run_id}')
    require(run['path'] == '.github/workflows/ci.yml' and run['head_branch'] == 'main')
    require(run['event'] in ('push', 'workflow_dispatch') and run['head_sha'] == commit)
    require(run['status'] == 'completed' and run['conclusion'] == 'success')
    require(run['head_repository']['full_name'] == repository)
    require_current_main(repository, commit)
    items = api(f'repos/{repository}/actions/runs/{run_id}/artifacts?per_page=100')
    matches = [item for item in items['artifacts'] if item['name'] == f"obake-production-{run['run_number']}"]
    require(len(matches) == 1 and not matches[0]['expired'])
    selected = matches[0]
    require(selected['workflow_run']['id'] == int(run_id))
    require(selected['workflow_run']['head_sha'] == commit)
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', selected['digest']))
    return selected


def settings():
    names = ('HOST', 'USER', 'ROOT', 'URL', 'DOMAIN', 'PHP', 'SSH_KEY', 'KNOWN_HOSTS')
    values = {name: os.environ.get('DEPLOY_' + name, '') for name in names}
    require(all(values.values()))
    for name in ('HOST', 'USER', 'ROOT', 'URL', 'DOMAIN', 'PHP'):
        require(not any(ord(char) < 32 or ord(char) == 127 for char in values[name]))
    for name in ('HOST', 'USER'):
        require(not values[name].startswith('-') and not any(char.isspace() for char in values[name]))
    require(all(values[name].startswith('/') for name in ('ROOT', 'PHP')))
    url = urlsplit(values['URL'])
    require(url.scheme == 'https' and url.hostname == values['DOMAIN'] and not url.username and not url.password)
    require(not url.query and not url.fragment)
    values['PORT'] = os.environ.get('DEPLOY_SSH_PORT') or '22'
    require(values['PORT'].isdecimal() and 1 <= int(values['PORT']) <= 65535)
    return values


def ssh_command(values, directory):
    key = directory / 'key'
    hosts = directory / 'known_hosts'
    key.write_text(values['SSH_KEY'].rstrip() + '\n')
    key.chmod(0o600)
    hosts.write_text(values['KNOWN_HOSTS'].rstrip() + '\n')
    hosts.chmod(0o600)
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(key), '-p', values['PORT'],
            '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
            '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={hosts}',
            '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'UpdateHostKeys=no',
            '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'ClearAllForwardings=yes',
            '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
            '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no',
            '-l', values['USER'], values['HOST']]


def remote(command, config, mode):
    script = Path(__file__).with_name('release.py').read_text()
    source = 'CONFIG = ' + repr(config | {'MODE': mode}) + '\n' + script
    result = subprocess.run(command + ['python3 -'], input=source, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, timeout=900)
    return json.loads(result.stdout)


def main():
    require(os.environ['GITHUB_REF'] == 'refs/heads/main')
    repository = os.environ['GITHUB_REPOSITORY']
    commit = os.environ['GITHUB_SHA']
    require(re.fullmatch(r'[0-9a-f]{40}', commit))
    selected = artifact(repository, os.environ['CI_RUN_ID'], commit)
    values = settings()
    config = {name: values[name] for name in ('USER', 'ROOT', 'URL', 'DOMAIN', 'PHP')}
    config.update(COMMIT=commit, DIGEST=selected['digest'].removeprefix('sha256:'),
                  RELEASE=commit + '-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'],
                  MIGRATE=os.environ.get('ALLOW_MIGRATIONS') == 'true')
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        archive = directory / 'package.zip'
        with archive.open('wb') as output:
            subprocess.run(['gh', 'api', f"repos/{repository}/actions/artifacts/{selected['id']}/zip"],
                           stdout=output, stderr=subprocess.DEVNULL, check=True, timeout=180)
        with archive.open('rb') as stream:
            require(hashlib.file_digest(stream, 'sha256').hexdigest() == config['DIGEST'])
        print('ARTIFACT=OK', flush=True)
        command = ssh_command(values, directory)
        require(remote(command, config, 'check') == {'status': 'OK'})
        print('SSH=OK\nTARGET=OK', flush=True)
        config['UPLOAD'] = remote(command, config, 'upload')['upload']
        try:
            destination = config['UPLOAD'] + '/package.zip'
            writer = 'import shutil,sys; f=open(' + repr(destination) + ',"xb"); shutil.copyfileobj(sys.stdin.buffer,f); f.close()'
            with archive.open('rb') as source:
                subprocess.run(command + [shlex.join(['python3', '-c', writer])], stdin=source,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=180)
            require_current_main(repository, commit)
            require(remote(command, config, 'deploy') == {'status': 'OK'})
        finally:
            require(remote(command, config, 'cleanup') == {'status': 'OK'})
        print('DEPLOY=OK\nHTTP=OK', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('DEPLOY=FAIL')
        sys.exit(1)
