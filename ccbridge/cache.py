import sqlite3
from pathlib import Path


class Cache:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS translations (
                hash TEXT NOT NULL,
                lang TEXT NOT NULL,
                translation TEXT NOT NULL,
                PRIMARY KEY (hash, lang)
            )
            """
        )
        self.conn.commit()

    def get(self, hash: str, lang: str) -> str | None:
        row = self.conn.execute(
            "SELECT translation FROM translations WHERE hash = ? AND lang = ?",
            (hash, lang),
        ).fetchone()
        return row[0] if row else None

    def put(self, hash: str, lang: str, translation: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO translations (hash, lang, translation) VALUES (?, ?, ?)",
            (hash, lang, translation),
        )
        self.conn.commit()

    def get_many(self, hashes: list[str], lang: str) -> dict[str, str]:
        result = {}
        for h in hashes:
            row = self.conn.execute(
                "SELECT translation FROM translations WHERE hash = ? AND lang = ?",
                (h, lang),
            ).fetchone()
            if row:
                result[h] = row[0]
        return result
