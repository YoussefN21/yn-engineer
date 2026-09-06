from PIL import Image
import sys

src = r"E:\Business\Website\assets\images\logo.png"
img = Image.open(src).convert("RGBA")
w, h = img.size
px = img.load()

white_out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
wpx = white_out.load()
dark_out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
dpx = dark_out.load()

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        # luminance of the glyph pixel (source is white glyph on black bg)
        lum = (0.299 * r + 0.587 * g + 0.114 * b)
        alpha = int(max(0, min(255, lum)) * (a / 255))
        wpx[x, y] = (255, 255, 255, alpha)
        dpx[x, y] = (22, 25, 28, alpha)

white_out.save(r"E:\Business\Website\assets\images\logo-white.png")
dark_out.save(r"E:\Business\Website\assets\images\logo-dark.png")
print("done", w, h)
