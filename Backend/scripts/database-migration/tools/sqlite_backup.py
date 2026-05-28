#!/usr/bin/env python3
"""Create a SQLite snapshot with the standard-library backup API.

The tool intentionally prints only aggregate status. Paths stay with the
TypeScript caller so cutover reports can decide whether local paths are safe to
display.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sqlite3
import sys


def _readonly_uri(path: str) -> str:
    return pathlib.Path(path).resolve().as_uri() + "?mode=ro"


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a SQLite backup snapshot.")
    parser.add_argument("source")
    parser.add_argument("destination")
    args = parser.parse_args()

    if not os.path.isfile(args.source):
        return _fail("source SQLite database does not exist")

    if os.path.exists(args.destination):
        return _fail("destination already exists")

    destination_parent = os.path.dirname(os.path.abspath(args.destination))
    if destination_parent:
        os.makedirs(destination_parent, exist_ok=True)

    try:
        source = sqlite3.connect(_readonly_uri(args.source), uri=True)
        destination = sqlite3.connect(args.destination)
        try:
            source.backup(destination)
            destination.commit()
            integrity_check = destination.execute("PRAGMA integrity_check").fetchone()[0]
            page_count = destination.execute("PRAGMA page_count").fetchone()[0]
            page_size = destination.execute("PRAGMA page_size").fetchone()[0]
        finally:
            destination.close()
            source.close()
    except sqlite3.Error as exc:
        return _fail(f"sqlite backup failed: {exc}")

    if integrity_check != "ok":
        return _fail("destination integrity_check failed")

    print(
        json.dumps(
            {
                "integrityCheck": integrity_check,
                "pageCount": page_count,
                "pageSize": page_size,
                "sqliteVersion": sqlite3.sqlite_version,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
