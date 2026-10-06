import os
import sys
import webview
from core.bridge import AurionBridge

def on_loaded(window, bridge):
    bridge.set_window(window)

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(base_dir, "frontend", "index.html")

    bridge = AurionBridge()

    window = webview.create_window(
        title="Aurion",
        url=html_path,
        js_api=bridge,
        width=1280,
        height=820,
        min_size=(1024, 700),
        background_color="#030508",
        frameless=False
    )

    # debug=False desactiva la ventana DevTools que te salía a la derecha
    webview.start(on_loaded, (window, bridge), gui='edgechromium', debug=True)