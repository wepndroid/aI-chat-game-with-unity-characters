#!/usr/bin/env python3
# Migration lifecycle: final-migration-required helper. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
"""Read selected rows from a lab SQLite copy as JSON Lines."""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def assert_safe_identifier(identifier: str) -> str:
    if not IDENTIFIER_PATTERN.match(identifier):
        raise ValueError(f"Unsafe SQLite identifier: {identifier}")

    return identifier


def quote_identifier(identifier: str) -> str:
    return '"' + assert_safe_identifier(identifier).replace('"', '""') + '"'


def read_rows(database_path: Path, table_name: str, columns: list[str]) -> None:
    if not columns:
        raise ValueError("At least one column is required.")

    table_sql = quote_identifier(table_name)
    uri = database_path.resolve().as_uri() + "?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")

    try:
        existing_columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table_sql})")}
        column_sql = ", ".join(
            quote_identifier(column) if column in existing_columns else f"NULL AS {quote_identifier(column)}"
            for column in columns
        )
        query = f"SELECT {column_sql} FROM {table_sql}"
        for row in connection.execute(query):
            print(json.dumps({column: row[column] for column in columns}, ensure_ascii=True, sort_keys=True))
    finally:
        connection.close()


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: sqlite_rows.py <database-path> <table-name> <columns-json>", file=sys.stderr)
        return 2

    database_path = Path(sys.argv[1])
    table_name = sys.argv[2]
    columns = json.loads(sys.argv[3])
    if not isinstance(columns, list) or not all(isinstance(column, str) for column in columns):
        print("columns-json must be a JSON string array.", file=sys.stderr)
        return 2

    read_rows(database_path, table_name, columns)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
