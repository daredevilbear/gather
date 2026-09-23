"""Exercise Docker DNS changes against the real gateway configuration, without exposed ports."""
import json
import pathlib
import subprocess
import tempfile
import time
import uuid

root = pathlib.Path(__file__).resolve().parents[2]
image = 'nginx:stable-alpine'
name = 'gather-dns-test-' + uuid.uuid4().hex[:8]
containers = []

def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.STDOUT).strip()

def start(suffix, *args):
    ident = name + '-' + suffix
    docker('run', '-d', '--name', ident, '--network', name, *args, image)
    containers.append(ident)
    return ident

try:
    docker('pull', image)
    docker('network', 'create', name)
    with tempfile.TemporaryDirectory(prefix='gather-dns-') as temporary:
        temp = pathlib.Path(temporary)
        for service, port in [('app', 3000), ('notifications', 8080)]:
            (temp / (service + '.conf')).write_text(f'server {{ listen {port}; location / {{ return 200 "$request_uri"; }} }}')
        app = start('app', '--network-alias', 'gather', '-v', f'{temp}/app.conf:/etc/nginx/conf.d/default.conf:ro')
        notifications = start('notifications', '--network-alias', 'notifications', '-v', f'{temp}/notifications.conf:/etc/nginx/conf.d/default.conf:ro')
        gateway = start('gateway', '-v', f'{root}/deploy/nginx-docker.conf:/etc/nginx/conf.d/default.conf:ro')
        print(docker('exec', gateway, 'nginx', '-t'))
        def expect(path):
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                try:
                    result = docker('exec', gateway, 'wget', '-qO-', 'http://127.0.0.1:8080' + path)
                    if result == path:
                        return
                except subprocess.CalledProcessError:
                    pass
                time.sleep(1)
            raise AssertionError('Gateway did not recover: ' + path)
        expect('/api/healthcheck?check=dns')
        expect('/gather-notifications/health?check=dns')
        for service, alias, target in [('app', 'gather', '/api/healthcheck?check=dns'), ('notifications', 'notifications', '/gather-notifications/health?check=dns')]:
            ident = name + '-' + service
            old = json.loads(docker('inspect', ident))[0]['NetworkSettings']['Networks'][name]['IPAddress']
            docker('rm', '-f', ident)
            containers.remove(ident)
            start('reserve-' + service, '--ip', old)
            start(service, '--network-alias', alias, '-v', f'{temp}/{service}.conf:/etc/nginx/conf.d/default.conf:ro')
            new = json.loads(docker('inspect', ident))[0]['NetworkSettings']['Networks'][name]['IPAddress']
            assert old != new
            expect(target)
            print(f'{service}: gateway recovered after address changed; path and query preserved')
        print('PASS: both upstreams recovered without restarting the gateway')
finally:
    for ident in reversed(containers):
        subprocess.run(['docker', 'rm', '-f', ident], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
