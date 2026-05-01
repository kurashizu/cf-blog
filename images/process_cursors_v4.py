import os
from PIL import Image, ImageFilter

def process_image(path, output_path):
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    # 1. Advanced Background Removal (Flood-fill + Morphological Cleaning)
    bg_color = pixels[0, 0]
    fuzz = 110  # Even higher fuzz
    
    # Create background mask
    mask = Image.new("L", img.size, 0)
    mask_pixels = mask.load()
    
    queue = [(0, 0)]
    visited = set([(0, 0)])
    mask_pixels[0, 0] = 255
    
    tr, tg, tb, ta = bg_color
    
    while queue:
        x, y = queue.pop(0)
        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                curr_color = pixels[nx, ny]
                if all(abs(curr_color[i] - [tr, tg, tb][i]) <= fuzz for i in range(3)):
                    mask_pixels[nx, ny] = 255
                    queue.append((nx, ny))
                visited.add((nx, ny))
    
    # Morphological operation: Dilate the mask to ensure the edges of the object are fully covered
    # This helps in removing those annoying 1-pixel borders
    mask = mask.filter(ImageFilter.MaxFilter(3))
    mask_pixels = mask.load()
    
    # Apply mask to alpha channel
    final_img = img.copy()
    final_pixels = final_img.load()
    for x in range(width):
        for y in range(height):
            if mask_pixels[x, y] == 255:
                r, g, b, a = final_pixels[x, y]
                final_pixels[x, y] = (r, g, b, 0)
    
    # 2. Strict Bounding Box (Manual Scan)
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    found = False
    
    # We scan from the edges to find the true bounds
    # Top edge
    for y in range(height):
        for x in range(width):
            if final_pixels[x, y][3] > 0:
                min_y = y
                found = True
                break
        if found: break
        
    if not found:
        final_img.save(output_path)
        return

    # Left edge
    for x in range(width):
        for y in range(height):
            if final_pixels[x, y][3] > 0:
                min_x = x
                break
                
    # Bottom edge
    for y in range(height - 1, -1, -1):
        for x in range(width):
            if final_pixels[x, y][3] > 0:
                max_y = y
                found = True
                break
        if found: break
        
    # Right edge
    found = False
    for x in range(width - 1, -1, -1):
        for y in range(height):
            if final_pixels[x, y][3] > 0:
                max_x = x
                break
        if found: break

    # Crop to exact bounding box
    final_img = final_img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # 3. Bottom-right 20% Gradient Fade
    w, h = final_img.size
    final_pixels = final_img.load()
    fade_w, fade_h = int(w * 0.2), int(h * 0.2)
    start_x, start_y = w - fade_w, h - fade_h
    
    for x in range(start_x, w):
        for y in range(start_y, h):
            u = (x - start_x) / fade_w if fade_w > 0 else 0
            v = (y - start_y) / fade_h if fade_h > 0 else 0
            alpha_factor = 1.0 - max(u, v)
            r, g, b, a = final_pixels[x, y]
            final_pixels[x, y] = (r, g, b, int(a * alpha_factor))
            
    final_img.save(output_path)

def main():
    import subprocess
    if not os.path.exists("cursor"): os.makedirs("cursor")
    subprocess.run(["magick", "Gemini_Generated_Image_lygnlmlygnlmlygn.png", "-crop", "924x964+50+20", "+repage", "-crop", "3x3@", "+repage", "cursor/cursor_%d.png"])
    
    folder = "cursor"
    for filename in os.listdir(folder):
        if filename.endswith(".png") and filename != "test.png":
            path = os.path.join(folder, filename)
            process_image(path, path)

if __name__ == "__main__":
    main()
