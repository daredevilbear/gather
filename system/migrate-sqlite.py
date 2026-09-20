#!/usr/bin/env python3
"""Offline migration from the encrypted-file store. Stop all three services first.
Existing encrypted files are retained for a reversible deployment rollback.
"""
import argparse
import json
from pathlib import Path
from database import initialize


def migrate(root):
    root=Path(root)
    state=json.loads((root/'control/state.json').read_text())
    if state.get('phase') not in ('idle','confirmed','rolled_back'):
        raise RuntimeError('Finish the pending recovery operation before migrating')
    if (root/'control/request.json').exists():
        raise RuntimeError('A configuration request is queued')
    records={domain:json.loads((root/domain/'active.enc').read_text()) for domain in ('app','notification')}
    for record in records.values():
        if record.get('version') != 1 or set(record) != {'version','iv','tag','body'}:
            raise RuntimeError('Invalid legacy encrypted record')
    initialize(root,records,state)
    print('Encrypted records migrated into SQLite; original ciphertext retained for deployment rollback.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',required=True)
    migrate(parser.parse_args().root)
