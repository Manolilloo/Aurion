import os
from PIL import Image, ImageDraw

def create_rounded_icon(input_image_path, output_ico_path, output_png_path, radius_percent=0.24):
    im = Image.open(input_image_path).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    
    # Recorte cuadrado centrado
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    
    # Máscara de alta resolución para esquinas suaves sin dientes de sierra
    scale = 4
    high_side = side * scale
    mask = Image.new('L', (high_side, high_side), 0)
    draw = ImageDraw.Draw(mask)
    
    radius = int(high_side * radius_percent)
    draw.rounded_rectangle([(0, 0), (high_side, high_side)], radius=radius, fill=255)
    mask = mask.resize((side, side), Image.Resampling.LANCZOS)
    
    # Fondo completamente transparente
    rounded = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    rounded.paste(im, (0, 0), mask=mask)
    
    # Guardar PNG en 256x256
    rounded_256 = rounded.resize((256, 256), Image.Resampling.LANCZOS)
    rounded_256.save(output_png_path, "PNG")
    
    # Guardar ICO multipágina de Windows con transparencia intacta
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    rounded.save(output_ico_path, format="ICO", sizes=sizes)
    print(f"Iconos generados con éxito en:\n - {output_ico_path}\n - {output_png_path}")

if __name__ == '__main__':
    # Busca la imagen actual en tus carpetas
    candidates = [
        "assets/icon.png",
        "assets/icon.ico",
        "icon.png",
        "extension/icon128.png"
    ]
    src = next((c for c in candidates if os.path.exists(c)), None)
    if src:
        os.makedirs("assets", exist_ok=True)
        create_rounded_icon(src, "assets/icon.ico", "assets/icon.png")
    else:
        print("No se encontró imagen base. Pon la foto de Garou en 'assets/icon.png' y vuelve a ejecutar.")