import os
import sqlite3
import threading
from contextlib import closing
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "aurion_history.db")


class AurionDatabase:
    """Motor de persistencia relacional SQLite para historial y telemetría de descargas."""

    def __init__(self):
        self.db_path = DB_FILE
        self._lock = threading.RLock()
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=15, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 15000")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self):
        with self._lock:
            try:
                with closing(self._get_conn()) as conn, conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS download_history (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            mode TEXT NOT NULL,
                            resolution TEXT DEFAULT '1080p',
                            size_bytes INTEGER DEFAULT 0,
                            file_path TEXT NOT NULL,
                            source_url TEXT DEFAULT '',
                            created_at TEXT NOT NULL
                        )
                    """)
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_mode ON download_history(mode)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_created ON download_history(created_at DESC)")
                    conn.execute("PRAGMA journal_mode = WAL")
                    conn.commit()
            except Exception as e:
                print(f"[Database] Error inicializando SQLite: {e}")

    def log_download(self, title: str, mode: str, resolution: str, size_bytes: int, file_path: str, source_url: str = ""):
        """Registra una descarga completada en la base de datos SQLite."""
        with self._lock:
            try:
                now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                with closing(self._get_conn()) as conn, conn:
                    conn.execute("""
                        INSERT INTO download_history (title, mode, resolution, size_bytes, file_path, source_url, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        str(title or "Archivo"),
                        str(mode or "anime").lower(),
                        str(resolution or "1080p"),
                        int(size_bytes or 0),
                        str(file_path or ""),
                        str(source_url or ""),
                        now_str
                    ))
                    conn.commit()
                return True
            except Exception as e:
                print(f"[Database] Error guardando registro en SQLite: {e}")
                return False

    def get_history(self, mode_filter: str = "all", search_query: str = "", limit: int = 150):
        """Obtiene el historial filtrado y las estadísticas globales agregadas."""
        with self._lock:
            try:
                try:
                    limit = max(1, min(int(limit), 1000))
                except (TypeError, ValueError):
                    limit = 150
                search_query = str(search_query or "").strip()[:200]
                mode_filter = str(mode_filter or "all").lower()
                if mode_filter not in {"all", "anime", "movie", "youtube"}:
                    mode_filter = "all"
                with closing(self._get_conn()) as conn, conn:
                    query = "SELECT * FROM download_history WHERE 1=1"
                    params = []

                    if mode_filter != "all":
                        query += " AND mode = ?"
                        params.append(mode_filter)

                    if search_query:
                        query += " AND title LIKE ?"
                        params.append(f"%{search_query}%")

                    query += " ORDER BY id DESC LIMIT ?"
                    params.append(int(limit))

                    rows = conn.execute(query, params).fetchall()
                    items = []
                    for r in rows:
                        f_path = r["file_path"]
                        items.append({
                            "id": r["id"],
                            "title": r["title"],
                            "mode": r["mode"],
                            "resolution": r["resolution"],
                            "size_bytes": r["size_bytes"],
                            "file_path": f_path,
                            "file_exists": bool(f_path and os.path.exists(f_path)),
                            "created_at": r["created_at"]
                        })

                    # Consulta SQL agregada para estadísticas globales
                    stats_row = conn.execute("""
                        SELECT 
                            COUNT(*) as total_count,
                            COALESCE(SUM(size_bytes), 0) as total_bytes,
                            SUM(CASE WHEN mode = 'anime' THEN 1 ELSE 0 END) as anime_count,
                            SUM(CASE WHEN mode = 'movie' THEN 1 ELSE 0 END) as movie_count,
                            SUM(CASE WHEN mode = 'youtube' THEN 1 ELSE 0 END) as yt_count
                        FROM download_history
                    """).fetchone()

                    stats = {
                        "total_count": stats_row["total_count"] or 0,
                        "total_bytes": stats_row["total_bytes"] or 0,
                        "anime_count": stats_row["anime_count"] or 0,
                        "movie_count": stats_row["movie_count"] or 0,
                        "yt_count": stats_row["yt_count"] or 0
                    }

                    return {"items": items, "stats": stats}
            except Exception as e:
                print(f"[Database] Error consultando historial: {e}")
                return {"items": [], "stats": {"total_count": 0, "total_bytes": 0, "anime_count": 0, "movie_count": 0, "yt_count": 0}}

    def delete_entry(self, entry_id: int):
        with self._lock:
            try:
                with closing(self._get_conn()) as conn, conn:
                    cursor = conn.execute("DELETE FROM download_history WHERE id = ?", (int(entry_id),))
                    conn.commit()
                return cursor.rowcount > 0
            except Exception:
                return False

    def clear_all(self):
        with self._lock:
            try:
                with closing(self._get_conn()) as conn, conn:
                    conn.execute("DELETE FROM download_history")
                    conn.commit()
                return True
            except Exception:
                return False