"""The companion receives only its own encrypted credentials and key."""
import base64
import json
import os
from pathlib import Path

def load():
    source=os.environ.get('GATHER_NOTIFICATION_VAULT')
    if not source:
        return
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    envelope=json.loads(Path(source).read_text())
    if envelope['version'] != 1:
        raise ValueError('Invalid vault')
    key=Path(os.environ['GATHER_NOTIFICATION_KEY_FILE']).read_bytes()
    plain=AESGCM(key).decrypt(base64.b64decode(envelope['iv']),base64.b64decode(envelope['body'])+base64.b64decode(envelope['tag']),b'gather-system-v1:notification')
    record=json.loads(plain)
    for name,value in record['env'].items():
        if name not in ('GATHER_ORIGIN','SESSION_URL','NTFY_URL','NTFY_TOPICS','NTFY_AUTH','APP_NAME','ICON_URL','PUSH_DATA') or not isinstance(value,str):
            raise ValueError('Invalid configuration')
        os.environ[name]=value
