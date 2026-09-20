import base64
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from vault_loader import load

class VaultTests(unittest.TestCase):
    def test_read_only_database_decryption_and_domain_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);key=os.urandom(32);iv=os.urandom(12)
            plain=json.dumps({'env':{'NTFY_AUTH':'Bearer test-secret'}}).encode()
            cipher=AESGCM(key).encrypt(iv,plain,b'gather-system-v1:notification')
            envelope={'version':1,'iv':base64.b64encode(iv).decode(),'body':base64.b64encode(cipher[:-16]).decode(),'tag':base64.b64encode(cipher[-16:]).decode()}
            with sqlite3.connect(root/'settings.sqlite') as db:
                db.execute('PRAGMA user_version=1');db.execute('CREATE TABLE records(slot TEXT PRIMARY KEY,envelope TEXT)')
                db.execute('INSERT INTO records VALUES (?,?)',('active',json.dumps(envelope)))
            (root/'key').write_bytes(key)
            with patch.dict(os.environ,{'GATHER_NOTIFICATION_VAULT':str(root/'settings.sqlite'),'GATHER_NOTIFICATION_KEY_FILE':str(root/'key')}):
                load();self.assertEqual(os.environ['NTFY_AUTH'],'Bearer test-secret')
                (root/'key').write_bytes(os.urandom(32))
                with self.assertRaises(Exception):load()
            self.assertNotIn(b'test-secret',(root/'settings.sqlite').read_bytes())
    def test_missing_database_never_creates_empty_database(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'missing.sqlite'
            with patch.dict(os.environ,{'GATHER_NOTIFICATION_VAULT':str(file)}):
                with self.assertRaises(sqlite3.OperationalError):load()
            self.assertFalse(file.exists())

if __name__=='__main__':unittest.main()
