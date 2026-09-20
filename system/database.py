"""SQLite storage shared by the operator migration and keyless recovery controller.
Only authenticated ciphertext enters records or requests. No decryption keys here.
"""
import json
import os
import sqlite3
from pathlib import Path

SCHEMA = 1

def open_database(root):
    root = Path(root)
    paths = [root / part / 'settings.sqlite' for part in ('control', 'app', 'notification')]
    if not all(p.is_file() for p in paths):
        raise RuntimeError('System databases are not initialized')
    db = sqlite3.connect(paths[0], timeout=5, isolation_level=None)
    try:
        db.execute('PRAGMA trusted_schema=OFF')
        db.execute('PRAGMA foreign_keys=ON')
        for name, file in zip(('app', 'notification'), paths[1:]):
            db.execute('ATTACH DATABASE ? AS ' + name, (str(file),))
        for name in ('main', 'app', 'notification'):
            if db.execute('PRAGMA '+name+'.user_version').fetchone()[0] != SCHEMA:
                raise RuntimeError('Unsupported system database schema')
            if db.execute('PRAGMA '+name+'.journal_mode').fetchone()[0] != 'delete':
                raise RuntimeError('Atomic recovery requires DELETE journal mode')
            db.execute('PRAGMA '+name+'.synchronous=FULL')
        return db
    except Exception:
        db.close()
        raise

def get(db, key, default=None):
    row = db.execute('SELECT value FROM control WHERE key=?', (key,)).fetchone()
    return json.loads(row[0]) if row else default

def put(db, key, value):
    db.execute('INSERT INTO control VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, json.dumps(value)))

def event(db, action, revision):
    # Deliberately exclude secret values, request bodies, URLs and exception text.
    db.execute("INSERT INTO audit(at,action,revision) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?)", (action,revision))

class Transaction:
    def __init__(self, root): self.root = root
    def __enter__(self):
        self.db = open_database(self.root)
        self.db.execute('BEGIN IMMEDIATE')
        return self.db
    def __exit__(self, kind, value, trace):
        try: self.db.execute('ROLLBACK' if kind else 'COMMIT')
        finally: self.db.close()

def initialize(root, records, state=None):
    """Explicit offline migration only. Never silently create or reset at startup."""
    os.umask(0o077)
    root = Path(root)
    targets = [root / domain / 'settings.sqlite' for domain in ('control','app','notification')]
    if any(p.exists() for p in targets):
        raise RuntimeError('Database already exists; refusing to overwrite')
    for domain, target in zip(('control','app','notification'), targets):
        target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        db = sqlite3.connect(target)
        try:
            db.execute('PRAGMA journal_mode=DELETE')
            db.execute('PRAGMA synchronous=FULL')
            db.execute('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT')
            db.execute("INSERT INTO schema_migrations VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
            if domain == 'control':
                db.execute('CREATE TABLE control(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
                db.execute('CREATE TABLE requests(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL) STRICT')
                db.execute('CREATE TABLE audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, revision TEXT) STRICT')
                put(db,'state',state or {'phase':'idle'})
                event(db,'sqlite_migration',None)
            else:
                db.execute("CREATE TABLE records(slot TEXT PRIMARY KEY CHECK(slot IN ('active','rollback')), envelope TEXT NOT NULL) STRICT")
                db.execute('INSERT INTO records VALUES (?,?)',('active',json.dumps(records[domain])))
            db.execute('PRAGMA user_version=1')
            db.commit()
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise RuntimeError('Database integrity check failed')
        finally: db.close()
        target.chmod(0o600)
