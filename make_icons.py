import os
from PIL import Image, ImageDraw

def round_corners(im, radius_ratio=0.22):
    """Aplica esquinas redondeadas modernas (squircle style) con antialiasing."""
    im = im.convert("RGBA")
    w, h = im.size
    
    # Renderizamos la máscara a 4x de resolución para que el borde quede perfectamente suave
    scale = 4
    mask = Image.new('L', (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask)
    
    radius = int(min(w, h) * radius_ratio * scale)
    draw.rounded_rectangle([(0, 0), (w * scale, h * scale)], radius=radius, fill=255)
    mask = mask.resize((w, h), Image.Resampling.LANCZOS)
    
    result = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    result.paste(im, (0, 0), mask=mask)
    return result

def main():
    # Busca la imagen de origen con mayor resolución que tengas
    possible_sources = [
        "assets/icon.png",
        "icon.png",
        "assets/logo.png",
        "extension/icon128.png"
    ]
    
    src_path = None
    for p in possible_sources:
        if os.path.exists(p):
            src_path = p
            break
            
    if not src_path:
        print("ERROR: No encontré ninguna imagen base (pon tu logo/icono en 'icon.png' o 'assets/icon.png').")
        return

    print(f"-> Procesando imagen base: {src_path}")
    base_img = Image.open(src_path)

    # 1. Redondear esquinas con transparencia
    rounded_master = round_corners(base_img, radius_ratio=0.22)

    # 2. Guardar iconos de la extensión
    ext_dir = os.path.join(os.path.dirname(__file__), "extension")
    os.makedirs(ext_dir, exist_ok=True)
    
    for size in [16, 48, 128]:
        resized = rounded_master.resize((size, size), Image.Resampling.LANCZOS)
        out_p = os.path.join(ext_dir, f"icon{size}.png")
        resized.save(out_p, "PNG")
        print(f"   [Extensión] Guardado: {out_p}")

    # 3. Guardar icon.ico multipágina para la app de escritorio
    assets_dir = os.path.join(os.path.dirname(__file__), "assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    ico_path = os.path.join(assets_dir, "icon.ico")
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    rounded_master.save(ico_path, format="ICO", sizes=icon_sizes)
    print(f"   [Escritorio] Generado icono de Windows: {ico_path}")

    # Guardar también el png redondeado master en assets
    rounded_master.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(assets_dir, "icon.png"), "PNG")
    print("\n¡Iconos redondeados generados con éxito!")

if __name__ == "__main__":
    main()