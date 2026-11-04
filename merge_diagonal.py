import os
from PIL import Image, ImageDraw, ImageFilter

def fusionar_diagonal_elegante(img1_path, img2_path, output_path, line_width=0, line_color="#ffffff", shadow=True):
    if not os.path.exists(img1_path) or not os.path.exists(img2_path):
        print("❌ Error: comprueba que las rutas de las imágenes existan.")
        return

    im1 = Image.open(img1_path).convert("RGBA")
    im2 = Image.open(img2_path).convert("RGBA")

    if im1.size != im2.size:
        im2 = im2.resize(im1.size, Image.Resampling.LANCZOS)

    w, h = im1.size

    # Máscara supersampleada 4x para que el filo diagonal quede ultra nítido
    scale = 4
    mask_large = Image.new("L", (w * scale, h * scale), 0)
    draw_mask = ImageDraw.Draw(mask_large)
    # Triángulo superior-derecho
    draw_mask.polygon([(0, h * scale), (w * scale, 0), (w * scale, h * scale)], fill=255)
    mask = mask_large.resize((w, h), Image.Resampling.LANCZOS)

    # Base: imagen 1
    base = im1.copy()

    # Si activamos sombra, proyectamos una sombra difusa antes de pegar im2
    if shadow:
        shadow_mask = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        # Dibujamos silueta negra en el borde
        s_draw = ImageDraw.Draw(shadow_mask)
        s_draw.polygon([(0, h), (w, 0), (w, h)], fill=(0, 0, 0, 180))
        # Difuminamos para efecto de elevación
        shadow_blur = shadow_mask.filter(ImageFilter.GaussianBlur(radius=14))
        base.paste(shadow_blur, (0, 0), shadow_blur)

    # Pegamos la capa superior
    base.paste(im2, (0, 0), mask)

    # Línea opcional (por defecto 0 = invisible)
    if line_width > 0:
        draw_res = ImageDraw.Draw(base)
        draw_res.line([(0, h), (w, 0)], fill=line_color, width=line_width)

    base.convert("RGB").save(output_path, quality=95)
    print(f"✅ Imagen generada limpiamente en: {output_path}")

if __name__ == "__main__":
    fusionar_diagonal_elegante(
        img1_path="assets/screenshots/03_youtube_channel_playlists.png",
        img2_path="assets/screenshots/03_youtube_channel_playlists_v2.png",
        output_path="assets/screenshots/03_youtube_channel_playlists.png",
        line_width=0,       # 0 para eliminar la línea por completo
        shadow=True         # Sombra suave que separa ambas capas de forma natural
    )