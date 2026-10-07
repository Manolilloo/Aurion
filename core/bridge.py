import os
import json
import threading
import ssl
import shutil
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
import io
import webview
from .downloader import AurionDownloader

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")

class AurionHTTPHandler(BaseHTTPRequestHandler):
    """Receptor HTTP para capturas de la extensión del navegador"""
    def log_message(self, format, *args):
        pass  # Silenciar logs ruidosos en consola

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/enqueue':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                if hasattr(self.server, 'bridge_instance'):
                    self.server.bridge_instance.on_extension_link(data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

class AurionBridge:
    def __init__(self):
        self.config = self.load_config()
        self._window = None
        self.downloader = AurionDownloader(self)
        self.start_internal_server()

    def set_window(self, window):
        self._window = window

    def start_internal_server(self):
        """Inicia un servidor local en el puerto 6800 para recibir enlaces"""
        def run_server():
            server_address = ('127.0.0.1', 6800)
            try:
                httpd = HTTPServer(server_address, AurionHTTPHandler)
                httpd.bridge_instance = self
                print("[Core] Servidor receptor Aurion escuchando en http://127.0.0.1:6800")
                httpd.serve_forever()
            except Exception as e:
                print(f"[Core] Error al iniciar servidor local en 6800: {e}")

        t = threading.Thread(target=run_server, daemon=True)
        t.start()

    def on_extension_link(self, data):
        """Envía el enlace capturado desde la extensión al frontend de la app"""
        if self._window:
            safe_data = json.dumps(data)
            self._window.evaluate_js(f"window.onLinkReceived && window.onLinkReceived({safe_data});")

    def load_config(self):
        default_config = {
            "active_mode": "anime",
            "anime": {
                "dir": "J:\\ANIME\\animes",
                "season": 1,
                "start_ep": 1,
                "save_cover": True,
                "res": "max",
                "fmt": "mp4",
                "threads": "32",
                "simul": "20"
            },
            "movie": {
                "dir": "J:\\ANIME\\animes\\pelisypeliu",
                "season": 1,
                "start_ep": 1,
                "save_cover": True,
                "res": "max",
                "fmt": "mp4",
                "threads": "32",
                "simul": "5"
            }
        }
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    default_config.update(data)
                    return default_config
            except Exception:
                pass
        return default_config

    def save_config(self, new_data):
        self.config.update(new_data)
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2)
            return True
        except Exception:
            return False

    def get_initial_state(self):
        return self.config

    def toggle_mode(self, mode):
        self.config["active_mode"] = mode
        self.save_config(self.config)
        return True

    def open_external_browser(self, url):
        import webbrowser
        threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()

    def select_folder(self, current_path=""):
        if not self._window:
            return current_path
        folder = self._window.create_file_dialog(
            webview.FOLDER_DIALOG,
            directory=current_path if os.path.exists(current_path) else os.path.expanduser("~")
        )
        if folder and len(folder) > 0:
            return folder[0]
        return current_path

    def get_disk_space(self, target_path):
        try:
            path = target_path if os.path.exists(target_path) else os.path.splitdrive(target_path)[0] + "\\"
            if not os.path.exists(path):
                path = os.path.abspath(os.sep)
            
            total, used, free = shutil.disk_usage(path)
            gb_total = round(total / (1024 ** 3), 1)
            gb_free = round(free / (1024 ** 3), 1)
            percent_used = round((used / total) * 100, 1)

            return {
                "drive": os.path.splitdrive(path)[0] or "Unidad",
                "total_gb": gb_total,
                "free_gb": gb_free,
                "percent_used": percent_used
            }
        except Exception:
            return {"drive": "N/A", "total_gb": 0, "free_gb": 0, "percent_used": 0}

    def get_dominant_colors(self, image_url):
        if not image_url:
            return None
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(image_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                data = resp.read()
                img = Image.open(io.BytesIO(data)).convert('RGB')
                img = img.resize((60, 60))
                colors = img.getcolors(maxcolors=3600)
                if not colors:
                    return None
                
                def color_vibrance(rgb):
                    r, g, b = rgb
                    max_c = max(r, g, b)
                    min_c = min(r, g, b)
                    saturation = (max_c - min_c) / max_c if max_c > 0 else 0
                    brightness = max_c / 255.0
                    if brightness < 0.15 or (brightness > 0.85 and saturation < 0.15):
                        return -1
                    return saturation * brightness

                valid_colors = []
                for count, rgb in colors:
                    score = color_vibrance(rgb)
                    if score > 0:
                        valid_colors.append((score * (count ** 0.5), rgb))
                
                valid_colors.sort(key=lambda x: x[0], reverse=True)

                if len(valid_colors) >= 2:
                    c1_rgb = valid_colors[0][1]
                    c2_rgb = valid_colors[1][1]
                    for _, rgb in valid_colors[1:]:
                        diff = abs(rgb[0] - c1_rgb[0]) + abs(rgb[1] - c1_rgb[1]) + abs(rgb[2] - c1_rgb[2])
                        if diff > 80:
                            c2_rgb = rgb
                            break
                    c1 = f"rgb({c1_rgb[0]}, {c1_rgb[1]}, {c1_rgb[2]})"
                    c2 = f"rgb({c2_rgb[0]}, {c2_rgb[1]}, {c2_rgb[2]})"
                    return {"accent1": c1, "accent2": c2}
                elif len(valid_colors) == 1:
                    c1_rgb = valid_colors[0][1]
                    c1 = f"rgb({c1_rgb[0]}, {c1_rgb[1]}, {c1_rgb[2]})"
                    return {"accent1": c1, "accent2": "#ff3366"}
        except Exception:
            pass
        return None

    def search_media(self, mode, query):
        if not query or len(query.strip()) < 2:
            return []

        query = query.strip()
        headers = {'User-Agent': 'Mozilla/5.0'}
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        if mode == 'anime':
            graphql_query = """
            query ($search: String) {
              Page (page: 1, perPage: 6) {
                media (search: $search, type: ANIME) {
                  title { romaji english }
                  coverImage { large color }
                  status
                  averageScore
                }
              }
            }
            """
            data = json.dumps({'query': graphql_query, 'variables': {'search': query}}).encode('utf-8')
            req = urllib.request.Request(
                'https://graphql.anilist.co',
                data=data,
                headers={'Content-Type': 'application/json', 'User-Agent': headers['User-Agent']}
            )
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
                    res_json = json.loads(response.read().decode('utf-8'))
                    items = res_json.get('data', {}).get('Page', {}).get('media', [])
                    results = []
                    for a in items:
                        status = 'TERMINADO' if a.get('status') == 'FINISHED' else ('EN EMISIÓN' if a.get('status') == 'RELEASING' else a.get('status'))
                        score = f"{a.get('averageScore', 0) / 10:.1f}" if a.get('averageScore') else 'N/A'
                        titles = a.get('title', {})
                        chosen_title = titles.get('romaji') or titles.get('english') or 'Desconocido'
                        results.append({
                            'title': chosen_title,
                            'alt_title': titles.get('english', ''),
                            'image': a.get('coverImage', {}).get('large', ''),
                            'color': a.get('coverImage', {}).get('color'),
                            'meta': f"{status} • ★ {score}"
                        })
                    return results
            except Exception:
                return []
        else:
            clean_query = query.lower().replace(' ', '_')
            encoded_query = urllib.parse.quote(clean_query)
            url = f"https://v3.sg.media-imdb.com/suggestion/x/{encoded_query}.json"
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    items = data.get('d', [])
                    results = []
                    for entry in items:
                        title = entry.get('l', '')
                        if not title:
                            continue
                        qid = entry.get('qid', '').lower()
                        stars = entry.get('s', '').lower()
                        if 'anime' in stars or 'animation' in stars or qid in ['video game', 'music video']:
                            continue
                        if qid not in ['movie', 'tvmovie', 'tvseries', 'feature']:
                            continue

                        img_dict = entry.get('i') or {}
                        img = img_dict.get('imageUrl', '')
                        year = str(entry.get('y', 'CINE'))
                        results.append({
                            'title': title,
                            'image': img,
                            'color': None,
                            'meta': f"{year} • PELÍCULA"
                        })
                        if len(results) >= 5:
                            break
                    return results
            except Exception:
                return []

    def close_app(self):
        if self._window:
            self._window.destroy()
        os._exit(0)

    def minimize_window(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize_window(self):
        if self._window:
            if getattr(self, '_is_maximized', False):
                self._window.restore()
                self._is_maximized = False
            else:
                self._window.maximize()
                self._is_maximized = True

    def close_window(self):
        if self._window:
            self._window.destroy()

    def set_window(self, win):
        self._window = win