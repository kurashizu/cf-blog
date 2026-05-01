import os
from PIL import Image, ImageFilter, ImageOps

def process_image(path, output_path):
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    # 1. Robust Background Removal using Exterior Flood-Fill
    # We fill from all 4 corners to be sure
    mask = Image.new("L", img.size, 0)
    mask_pixels = mask.load()
    
    # Higher fuzz for the flood fill to capture more background
    fuzz = 80 
    bg_color = pixels[0, 0]
    tr, tg, tb, ta = bg_color
    
    def flood_fill(start_x, start_y):
        if mask_pixels[start_x, start_y] == 255:
            return
        queue = [(start_x, start_y)]
        mask_pixels[start_x, start_y] = 255
        visited = set([(start_x, start_y)])
        
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

    # Fill from corners
    flood_fill(0, 0)
    flood_fill(width-1, 0)
    flood_fill(0, height-1)
    flood_fill(width-1, height-1)
    
    # The mask now represents the EXTERIOR background.
    # Invert it to get the OBJECT mask (Interior + Object)
    obj_mask = ImageOps.invert(mask)
    
    # 2. Morphological Cleaning on the Object Mask
    # Fill holes: Closing (Dilation then Erosion)
    # Dilation expands the object to fill holes
    obj_mask = obj_mask.filter(ImageFilter.MaxFilter(3)) 
    # Erosion shrinks it back to original size but leaves holes filled
    obj_mask = obj_mask.filter(ImageFilter.MinFilter(3))
    
    # Final border cleanup: Small erosion to remove "dirty" edge pixels
    obj_mask = obj_mask.filter(ImageFilter.MinFilter(3))
    
    obj_mask_pixels = obj_mask.load()
    
    # Apply Object Mask to Alpha Channel
    final_img = img.copy()
    final_pixels = final_img.load()
    for x in range(width):
        for y in range(height):
            # Any pixel marked as background (0 in obj_mask) becomes transparent
            if obj_mask_pixels[x, y] < 128:
                r, g, b, a = final_pixels[x, y]
                final_pixels[x, y] = (r, g, b, 0)
    
    # 3. Strict Bounding Box
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    found = False
    
    for x in range(width):
        for y in range(height):
            if final_pixels[x, y][3] > 0:
                found = True
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
                
    if not found:
        final_img.save(output_path)
        return

    final_img = final_img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # 4. Bottom-right 20% Gradient Fade
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
    source_img = "Gemini_Generated_Image_e3x21e3x21e3x21e.png"
    subprocess.run(["magick", source_img, "-crop", "924x964+50+20", "+repage", "-crop", "3x3@", "+repage", "cursor/cursor_%d.png"])
    
    folder = "cursor"
    for filename in os.listdir(folder):
        if filename.endswith(".png") and filename != "test.png":
            path = os.path.join(folder, filename)
            process_image(path, path)

if __name__ == "__main__":
    main()
