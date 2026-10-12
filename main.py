import os
import sys

# Sincronización nativa a los Hz del monitor (165 Hz) sin saturar la CPU
os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = (
    '--enable-gpu-rasterization '
    '--enable-zero-copy '
    '--ignore-gpu-blocklist '
    '--canvas-oop-rasterization '
    '--enable-features=VaapiVideoDecoder'
)

import ctypes
import webview
from core.bridge import AurionBridge

# Forzar ID de aplicación en Windows para que la barra de tareas fije el icono propio y no el de Python
try:
    myappid = 'manolilloo.aurion.desktop.1.1.3'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

def set_window_icon():
    """Fuerza el icono redondeado directamente en el HWND nativo de Windows."""
    try:
        import ctypes
        import os
        ico_path = os.path.abspath("assets/icon.ico")
        if not os.path.exists(ico_path):
            return

        # Cargar icono nativo de 32x32 para la barra de tareas
        hicon = ctypes.windll.user32.LoadImageW(
            None, ico_path, 1, 32, 32, 0x00000010
        )
        if hicon:
            hwnd = ctypes.windll.user32.FindWindowW(None, "Aurion")
            if hwnd:
                WM_SETICON = 0x0080
                ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 1, hicon) # ICON_BIG
                ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 0, hicon) # ICON_SMALL
    except Exception:
        pass

def on_loaded(window, bridge):
    import threading
    threading.Timer(0.3, set_window_icon).start()

def main():
    bridge = AurionBridge()

    window = webview.create_window(
        'Aurion',
        'frontend/index.html',
        js_api=bridge,
        width=1320,
        height=780,
        frameless=True,
        easy_drag=False,
        resizable=True,
        min_size=(1100, 650),
        background_color='#06090e'
    )
    bridge.set_window(window)

    webview.start(on_loaded, (window, bridge), gui='edgechromium', debug=False, http_port=8085)

    # Limpieza final una vez que la ventana se ha destruido
    try:
        dl = getattr(bridge, 'downloader', None) or getattr(bridge, '_downloader', None)
        if dl:
            dl.cleanup_all_temp()
    except Exception:
        pass

if __name__ == '__main__':
    main()