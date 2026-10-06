import threading
import time

class AurionDownloader:
    def __init__(self, bridge):
        self.bridge = bridge
        self.queue = []
        self.is_downloading = False

    def add_to_queue(self, url, metadata):
        """Añade un enlace a la cola interna."""
        item = {
            "url": url,
            "title": metadata.get("title", "Desconocido"),
            "status": "waiting"
        }
        self.queue.append(item)
        print(f"[Core] Añadido a la cola: {item['title']}")
        return True

    def start_engine(self, config):
        """Simula el inicio del motor multihilo."""
        if self.is_downloading:
            return False
            
        self.is_downloading = True
        threading.Thread(target=self._mock_download_process, args=(config,), daemon=True).start()
        return True

    def _mock_download_process(self, config):
        """Proceso en segundo plano aislado de la UI."""
        print(f"[Core] Iniciando extracción con {config.get('threads', 32)} hilos...")
        time.sleep(2) # Simulación
        print("[Core] Extracción completada.")
        self.is_downloading = False