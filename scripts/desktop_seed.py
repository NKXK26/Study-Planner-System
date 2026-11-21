"""Build the distributable SQLite seed exclusively from reviewed reference rows."""
import argparse
import filecmp
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
from contextlib import closing

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "build-resources/seed/planner-seed.db"
MANIFEST = ROOT / "build-resources/desktop-reference.json"
COLUMNS = {
    "Course": "ID Code Name CreditsRequired Status",
    "Major": "ID CourseID CourseCode Name Status",
    "Term": "ID Name Year Month Status SemType",
    "CourseIntake": "ID Status TermID MajorID",
    "UnitType": "ID Name Colour",
    "UnitTypeColor": "id unitTypeId color",
    "Unit": "ID UnitCode Name CreditPoints Availability unit_type_id",
    "UnitTermOffered": "ID UnitID TermType",
    "UnitRequisiteRelationship": "ID UnitID RequisiteUnitID UnitRelationship LogicalOperators MinCP",
    "user_group_access": "id name access module",
    "roles": "ID Name Priority IsSystem IsActive CreatedAt UpdatedAt",
    "permissions": "ID Name Resource Action Module IsActive CreatedAt",
    "role_permissions": "ID RoleID PermissionID Granted GrantedAt",
}


def reference_rows():
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if rows.keys() != COLUMNS.keys() or not all(rows.values()):
        raise ValueError("Reference manifest contains missing, empty or unapproved tables")
    return rows


def create_seed(path, rows):
    # Diff the checked-in schema against an empty schema. No database introspection.
    sql = subprocess.check_output([
        "node", "node_modules/prisma/build/index.js", "migrate", "diff",
        "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script",
    ], cwd=ROOT, env={**os.environ, "DATABASE_URL": "file::memory:", "DIRECT_URL": "file::memory:"})
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript(sql.decode("utf-8-sig"))
        db.execute("PRAGMA foreign_keys=ON")
        for table, fields in COLUMNS.items():
            columns = fields.split()
            placeholders = ",".join("?" for _ in columns)
            db.executemany(f'INSERT INTO "{table}" ({",".join(columns)}) VALUES ({placeholders})',
                           sorted(rows[table], key=lambda row: row[0]))


def check_counts(path, rows):
    for suffix in ("-wal", "-shm", "-journal"):
        if Path(str(path) + suffix).exists():
            raise ValueError("Unexpected SQLite sidecar beside seed")
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)] or db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Seed failed SQLite integrity checks")
        tables = db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
        counts = {}
        for (table,) in tables:
            name = table.replace('"', '""')
            count = db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            if count != len(rows.get(table, [])):
                raise ValueError(f"Unexpected row count in {table}: {count}")
            counts[table] = count
        if not COLUMNS.keys() <= counts.keys():
            raise ValueError("Seed is missing required tables")
        return counts


def process_seed(action, target=SEED):
    rows = reference_rows()
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as directory:
        clean = Path(directory) / "reference.db"
        create_seed(clean, rows)
        check_counts(clean, rows)
        if action == "generate":
            for suffix in ("-wal", "-shm", "-journal"):
                if Path(str(target) + suffix).exists():
                    raise ValueError("Seed has an active or stale journal")
            os.replace(clean, target)
        else:
            counts = check_counts(target, rows)
            if not filecmp.cmp(clean, target, shallow=False):
                raise ValueError("Seed differs from the clean reference build")
            return counts
    return check_counts(target, rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("generate", "validate"))
    counts = process_seed(parser.parse_args().action)
    print("Desktop seed table counts:", json.dumps(counts, sort_keys=True))
