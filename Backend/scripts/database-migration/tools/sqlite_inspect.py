#!/usr/bin/env python3
# Migration lifecycle: final-migration-required helper. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
"""Read-only SQLite inspection helper for the PostgreSQL migration lab."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def inspect_database(database_path: Path) -> dict:
    uri = database_path.resolve().as_uri() + "?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    connection.execute("PRAGMA query_only = ON")

    try:
        integrity_check = connection.execute("PRAGMA integrity_check").fetchone()[0]
        schema_rows = connection.execute(
            """
            SELECT name, type, sql
            FROM sqlite_schema
            WHERE type IN ('table', 'view')
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name
            """
        ).fetchall()

        tables = [
            {
                "name": row[0],
                "type": row[1],
                "sql": row[2],
            }
            for row in schema_rows
        ]

        row_counts = {}
        schema_text_parts = []
        for table in tables:
            schema_text_parts.append(f"{table['type']}:{table['name']}:{table['sql'] or ''}")
            if table["type"] == "table":
                count_sql = f"SELECT COUNT(*) FROM {quote_identifier(table['name'])}"
                row_counts[table["name"]] = int(connection.execute(count_sql).fetchone()[0])

        schema_hash = hashlib.sha256("\n".join(schema_text_parts).encode("utf-8")).hexdigest()

        return {
            "sqliteVersion": sqlite3.sqlite_version,
            "integrityCheck": integrity_check,
            "tables": tables,
            "rowCounts": row_counts,
            "schemaHash": schema_hash,
        }
    finally:
        connection.close()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: sqlite_inspect.py <database-path>", file=sys.stderr)
        return 2

    database_path = Path(sys.argv[1])
    report = inspect_database(database_path)
    print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
