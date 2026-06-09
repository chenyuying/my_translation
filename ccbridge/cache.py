import sqlite3
import threading
from pathlib import Path


class Cache:
    def __init__(self, db_path):
        # Flask dev server 多線程：connection 在主線程建立、請求跑在 worker 線程，
        # 故放寬同線程檢查並用 lock 序列化存取（本地單人低並發，安全）。
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._lock = threading.Lock()
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
        with self._lock:
            row = self.conn.execute(
                "SELECT translation FROM translations WHERE hash = ? AND lang = ?",
                (hash, lang),
            ).fetchone()
        return row[0] if row else None

    def put(self, hash: str, lang: str, translation: str) -> None:
        with self._lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO translations (hash, lang, translation) VALUES (?, ?, ?)",
                (hash, lang, translation),
            )
            self.conn.commit()

    def get_many(self, hashes: list[str], lang: str) -> dict[str, str]:
        result = {}
        with self._lock:
            for h in hashes:
                row = self.conn.execute(
                    "SELECT translation FROM translations WHERE hash = ? AND lang = ?",
                    (h, lang),
                ).fetchone()
                if row:
                    result[h] = row[0]
        return result
