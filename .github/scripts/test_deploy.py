import hashlib
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


deploy = load('deploy')
release = load('release')
COMMIT = 'a' * 40


class ArtifactTest(unittest.TestCase):
    def setUp(self):
        self.run = dict(path='.github/workflows/ci.yml', head_branch='main', event='push',
                        head_sha=COMMIT, status='completed', conclusion='success', run_number=7,
                        head_repository={'full_name': 'owner/repository'})
        self.artifact = dict(name='obake-production-7', expired=False, id=99, digest='sha256:' + 'b' * 64,
                             workflow_run={'id': 42, 'head_sha': COMMIT})

    def select(self, run=None, artifacts=None):
        with patch.object(deploy, 'api', side_effect=[self.run if run is None else run,
                                                     {'artifacts': [self.artifact] if artifacts is None else artifacts}]):
            return deploy.artifact('owner/repository', '42', COMMIT)

    def test_accepts_exact_successful_main_run(self):
        self.assertEqual(self.select()['id'], 99)

    def test_rejects_untrusted_runs(self):
        for key, value in [('head_sha', 'c' * 40), ('event', 'pull_request'), ('head_branch', 'feature'),
                           ('conclusion', 'failure'), ('status', 'in_progress'), ('path', 'other.yml'),
                           ('head_repository', {'full_name': 'fork/repository'})]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.select(self.run | {key: value})

    def test_rejects_missing_expired_or_mismatched_artifacts(self):
        invalid = [[], [self.artifact, self.artifact], [self.artifact | {'expired': True}],
                   [self.artifact | {'digest': 'invalid'}],
                   [self.artifact | {'workflow_run': {'id': 43, 'head_sha': COMMIT}}],
                   [self.artifact | {'workflow_run': {'id': 42, 'head_sha': 'd' * 40}}]]
        for artifacts in invalid:
            with self.subTest(artifacts=artifacts), self.assertRaises(ValueError):
                self.select(artifacts=artifacts)


class TransportTest(unittest.TestCase):
    def setUp(self):
        self.values = dict(HOST='example.invalid', USER='site-user', ROOT='/application',
                           URL='https://example.invalid', DOMAIN='example.invalid', PHP='/usr/bin/php8.5',
                           SSH_KEY='private-key', KNOWN_HOSTS='host-key', PORT='22')

    def test_secrets_and_ssh_options(self):
        environment = {'DEPLOY_' + key: value for key, value in self.values.items() if key != 'PORT'}
        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(deploy.settings()['PORT'], '22')
        with tempfile.TemporaryDirectory() as directory:
            command = deploy.ssh_command(self.values, Path(directory))
            for option in ('BatchMode=yes', 'StrictHostKeyChecking=yes', 'IdentitiesOnly=yes',
                           'IdentityAgent=none', 'PasswordAuthentication=no', 'GlobalKnownHostsFile=/dev/null'):
                self.assertIn(option, command)
            self.assertEqual(stat.S_IMODE((Path(directory) / 'key').stat().st_mode), 0o600)
        for key, value in [('HOST', '-option'), ('USER', 'user\nname'), ('ROOT', 'relative'),
                           ('URL', 'http://example.invalid'), ('DOMAIN', 'other.invalid'), ('SSH_KEY', '')]:
            with patch.dict(os.environ, environment | {'DEPLOY_' + key: value}, clear=True):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    deploy.settings()

    def test_remote_exception_does_not_print_private_values(self):
        source = Path(release.__file__).read_text()
        config = dict(MODE='check', USER='private-user', ROOT='/private/path', PHP='/private/php')
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
            exec(compile(source, '<remote>', 'exec'), {'__name__': '__main__', 'CONFIG': config})
        self.assertEqual(json.loads(output.getvalue()), {'status': 'FAIL'})

    def test_runner_exception_does_not_print_private_values(self):
        result = subprocess.run([os.sys.executable, deploy.__file__],
                                env={'GITHUB_REF': 'private-ref'}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, 'DEPLOY=FAIL\n')
        self.assertEqual(result.stderr, '')


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.base = self.directory / 'site'
        self.home = self.directory / 'home'
        self.base.mkdir()
        self.home.mkdir()
        self.config = dict(ROOT=str(self.base), PHP='/usr/bin/php8.5', USER='site-user',
                           URL='https://example.invalid', DOMAIN='example.invalid', COMMIT=COMMIT,
                           RELEASE=COMMIT + '-42-1', MIGRATE=False)
        self.files = {'artisan': 'php', 'app/example.php': 'code', 'public/index.php': 'index',
                      'public/build/manifest.json': '{}', 'public/build/release.txt': COMMIT,
                      'vendor/autoload.php': 'autoload', 'vendor/composer/platform_check.php': 'platform',
                      'bootstrap/cache/stale.php': 'stale cache', 'database/migrations/old.php': 'old',
                      '.release-commit': COMMIT}
        for name, value in self.files.items():
            path = self.base / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        for path, value in [(self.base / '.env', 'APP_KEY=preserved'),
                             (self.home / '.dploy/overlays/.env', 'APP_KEY=preserved'),
                             (self.base / 'storage/app/private/attachment', 'live attachment'),
                             (self.base / 'shared/storage/old-copy', 'keep this too')]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        patches = [patch.object(release.Path, 'home', return_value=self.home),
                   patch.object(release.os, 'geteuid', return_value=1000),
                   patch.object(release.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name='site-user')),
                   patch.object(release, 'quiet'), patch.object(release, 'healthy'),
                   patch.object(release, 'upload_directory', return_value=self.directory)]
        self.mocks = [item.start() for item in patches]
        for item in patches:
            self.addCleanup(item.stop)

    def package(self, additions=None):
        archive = self.directory / 'package.zip'
        with zipfile.ZipFile(archive, 'w') as package:
            for name, content in (self.files | (additions or {})).items():
                package.writestr(name, content)
        self.config['DIGEST'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        return archive

    def prepared(self):
        release.prepare(self.config)
        self.package()

    def test_prepare_preserves_live_storage_and_unused_copy(self):
        release.prepare(self.config)
        release.prepare(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base)
        self.assertTrue(os.path.samefile(self.base / 'storage', self.base / 'shared/storage'))
        self.assertEqual((self.base / 'storage/app/private/attachment').read_text(), 'live attachment')
        backups = list((self.base / 'shared').glob('storage-before-actions-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'old-copy').read_text(), 'keep this too')

    def test_deploy_switches_only_after_validation_and_keeps_data(self):
        self.prepared()
        release.deploy(self.config)
        current = self.base / 'current'
        self.assertEqual(current.resolve(), self.base / 'releases' / self.config['RELEASE'])
        self.assertEqual((current / '.env').read_text(), 'APP_KEY=preserved')
        self.assertEqual((current / 'storage/app/private/attachment').read_text(), 'live attachment')
        self.assertFalse((current / 'bootstrap/cache/stale.php').exists())
        self.mocks[-2].assert_called_once()

    def test_unprepared_target_and_changed_environment_fail(self):
        with self.assertRaises(ValueError):
            release.target(self.config)
        (self.home / '.dploy/overlays/.env').write_text('different')
        with self.assertRaises(ValueError):
            release.prepare(self.config)
        self.assertFalse((self.base / 'current').exists())

    def test_rejects_archive_traversal_secrets_symlinks_and_nested_public(self):
        for name in ('../outside', '/absolute', '.env', 'public/public/index.php', 'public/storage/file',
                     'database/database.sqlite', 'resources/js/source.js'):
            with self.subTest(name=name):
                archive = self.package({name: 'bad'})
                with self.assertRaises(ValueError):
                    release.unpack(archive, self.directory / 'unpacked', COMMIT)
        archive = self.package()
        with zipfile.ZipFile(archive, 'a') as package:
            link = zipfile.ZipInfo('public/link')
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            package.writestr(link, '/outside')
        with self.assertRaises(ValueError):
            release.unpack(archive, self.directory / 'unpacked', COMMIT)

    def test_wrong_digest_and_commit_never_switch(self):
        self.prepared()
        self.config['DIGEST'] = '0' * 64
        with self.assertRaises(ValueError):
            release.deploy(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base)
        archive = self.package()
        with self.assertRaises(ValueError):
            release.unpack(archive, self.directory / 'unpacked', 'c' * 40)

    def test_migrations_require_explicit_opt_in(self):
        self.prepared()
        self.package({'database/migrations/new.php': 'new'})
        with self.assertRaises(ValueError):
            release.deploy(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base)
        self.assertFalse(any('migrate' in call.args[0] for call in self.mocks[3].call_args_list))

    def test_health_failure_restores_previous_release_without_migrations(self):
        self.prepared()
        self.mocks[-2].side_effect = RuntimeError('private diagnostic')
        with self.assertRaises(RuntimeError):
            release.deploy(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base)

    def test_failure_after_migration_does_not_roll_back_schema_or_code(self):
        self.prepared()
        self.package({'database/migrations/new.php': 'new'})
        self.config['MIGRATE'] = True
        self.mocks[-2].side_effect = RuntimeError('health failed')
        with self.assertRaises(RuntimeError):
            release.deploy(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base / 'releases' / self.config['RELEASE'])
        commands = [call.args[0] for call in self.mocks[3].call_args_list]
        self.assertTrue(any('up' in command for command in commands))
        self.assertFalse(any('migrate:rollback' in command for command in commands))

    def test_failed_migration_clears_maintenance_without_switching(self):
        self.prepared()
        self.package({'database/migrations/new.php': 'new'})
        self.config['MIGRATE'] = True
        def run(command, cwd=None):
            if 'migrate' in command:
                raise RuntimeError('migration failed')
        self.mocks[3].side_effect = run
        with self.assertRaises(RuntimeError):
            release.deploy(self.config)
        self.assertEqual((self.base / 'current').resolve(), self.base)
        self.assertTrue(any('up' in call.args[0] for call in self.mocks[3].call_args_list))


if __name__ == '__main__':
    unittest.main()
