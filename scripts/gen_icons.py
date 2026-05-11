#!/usr/bin/env python3
"""Generate Eat My Cookies extension icons, animation frames, and badge art."""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BASE = Path(__file__).resolve().parent.parent
ICONS_DIR = BASE / 'icons'
FRAMES_DIR = ICONS_DIR / 'frames'
BADGES_DIR = ICONS_DIR / 'badges'

# Cookie palette
C_BG = (0, 0, 0, 0)
C_EDGE = (108, 58, 16, 255)
C_BODY = (199, 128, 54, 255)
C_BODY_2 = (227, 166, 92, 255)
C_CENTER = (244, 199, 125, 210)
C_CHIP = (47, 20, 8, 255)
C_CHIP_HI = (98, 58, 34, 220)
C_CRUMB = (248, 214, 159, 255)
C_AMBER = (245, 166, 35, 255)
C_AMBER_SOFT = (245, 166, 35, 90)
C_STROKE = (43, 28, 12, 170)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save(img: Image.Image, path: Path) -> None:
    ensure_parent(path)
    img.save(path, 'PNG')
    print(f'  ✓ {path.relative_to(BASE)}')


def blend(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def add_glow(canvas: Image.Image, cx: int, cy: int, radius: int, strength: float) -> None:
    if strength <= 0:
        return
    glow = Image.new('RGBA', canvas.size, C_BG)
    d = ImageDraw.Draw(glow)
    for step in range(6, 0, -1):
        rr = radius + int(radius * 0.14 * step * strength)
        alpha = int(22 * step * strength)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(245, 166, 35, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(max(2, int(radius * 0.07))))
    canvas.alpha_composite(glow)


def draw_cookie(
    size: int,
    *,
    bite: float = 0.36,
    glow: float = 0.0,
    crumb_level: float = 0.0,
    angle_deg: float = -36,
    chips_variant: int = 0,
) -> Image.Image:
    sc = 6
    s = size * sc
    cx = cy = s // 2
    radius = int(s * 0.45)

    img = Image.new('RGBA', (s, s), C_BG)
    add_glow(img, cx, cy, radius, glow)
    d = ImageDraw.Draw(img)

    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=C_EDGE)

    inner_radius = radius - max(4, int(radius * 0.10))
    for idx in range(7):
        t = idx / 6
        rr = inner_radius - int(inner_radius * 0.08 * t)
        col = blend(C_BODY, C_BODY_2, t * 0.75)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=col)

    center_r = int(inner_radius * 0.56)
    d.ellipse((cx - center_r, cy - center_r, cx + center_r, cy + center_r), fill=C_CENTER)

    chip_sets = [
        [(-0.44, -0.28, 0.95), (-0.19, -0.02, 0.82), (-0.56, 0.14, 0.85), (-0.18, 0.49, 0.92), (-0.46, 0.40, 0.78)],
        [(-0.47, -0.23, 0.90), (-0.17, -0.10, 0.78), (-0.60, 0.10, 0.84), (-0.25, 0.43, 0.96), (-0.52, 0.34, 0.76), (0.08, 0.17, 0.74)],
        [(-0.40, -0.33, 0.86), (-0.07, -0.08, 0.80), (-0.54, 0.02, 0.88), (-0.14, 0.43, 0.94), (-0.54, 0.46, 0.82), (0.10, 0.12, 0.70)],
    ]
    chip_defs = chip_sets[chips_variant % len(chip_sets)]

    bite_angle = math.radians(angle_deg)
    bite_x = cx + int(radius * 1.02 * math.cos(bite_angle))
    bite_y = cy + int(radius * 1.02 * math.sin(bite_angle))
    bite_r = int(radius * bite)

    chip_r = max(2, int(radius * 0.09))
    for dx, dy, mult in chip_defs:
        px = cx + int(dx * radius)
        py = cy + int(dy * radius)
        pr = max(2, int(chip_r * mult))
        if math.hypot(px - cx, py - cy) > inner_radius - pr * 1.8:
            continue
        if bite > 0 and math.hypot(px - bite_x, py - bite_y) < bite_r + pr * 1.4:
            continue
        d.ellipse((px - pr, py - int(pr * 0.84), px + pr, py + int(pr * 0.84)), fill=C_CHIP)
        hi = max(1, pr // 3)
        d.ellipse((px - hi, py - hi, px, py), fill=C_CHIP_HI)

    if bite > 0:
        mask = Image.new('L', (s, s), 255)
        md = ImageDraw.Draw(mask)
        md.ellipse((bite_x - bite_r, bite_y - bite_r, bite_x + bite_r, bite_y + bite_r), fill=0)
        img.putalpha(ImageChops.multiply(img.getchannel('A'), mask))
        d = ImageDraw.Draw(img)

        crumb_count = max(0, int(11 * crumb_level))
        for idx in range(crumb_count):
            theta = bite_angle + (-0.45 + idx * 0.10)
            dist = radius * (1.02 + idx * 0.05)
            cr = max(2, int(radius * (0.028 + (idx % 3) * 0.008)))
            px = cx + int(dist * math.cos(theta))
            py = cy + int(dist * math.sin(theta)) + int(idx * radius * 0.035)
            d.ellipse((px - cr, py - cr, px + cr, py + cr), fill=C_CRUMB)

    img = img.filter(ImageFilter.GaussianBlur(max(0, int(size * 0.01))))
    outline = Image.new('RGBA', (s, s), C_BG)
    od = ImageDraw.Draw(outline)
    od.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=C_STROKE, width=max(4, s // 48))
    img.alpha_composite(outline)

    return img.resize((size, size), Image.LANCZOS)


def badge_canvas(width=128, height=128):
    return Image.new('RGBA', (width, height), C_BG)


def shadowed_cookie(size, **kwargs):
    cookie = draw_cookie(size, **kwargs)
    shadow = cookie.copy().filter(ImageFilter.GaussianBlur(max(1, size // 16)))
    shadow = Image.new('RGBA', cookie.size, C_BG)
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((size * 0.08, size * 0.12, size * 0.94, size * 0.96), fill=(0, 0, 0, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, size // 10)))
    out = Image.new('RGBA', cookie.size, C_BG)
    out.alpha_composite(shadow, (0, 0))
    out.alpha_composite(cookie, (0, 0))
    return out


def star_points(cx, cy, outer_r, inner_r, points=5, rotation=-90):
    coords = []
    for idx in range(points * 2):
        angle = math.radians(rotation + idx * 180 / points)
        radius = outer_r if idx % 2 == 0 else inner_r
        coords.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return coords


def add_star(img, cx, cy, outer_r, inner_r, fill, outline=None):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.polygon(star_points(cx, cy, outer_r, inner_r), fill=fill, outline=outline)
    img.alpha_composite(overlay)


def add_ring(img, box, *, outline=(245, 166, 35, 120), width=8, blur=2):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.ellipse(box, outline=outline, width=width)
    if blur:
        overlay = overlay.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(overlay)


def add_sparkles(img, specs):
    for cx, cy, outer_r, inner_r, alpha in specs:
        add_star(img, cx, cy, outer_r, inner_r, (255, 244, 201, alpha), (245, 166, 35, min(255, alpha + 20)))


def add_banner_ribbon(img, *, top=84, left=18, right=110, height=22, fill=(179, 45, 62, 255)):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, top + height), radius=9, fill=fill)
    draw.polygon([(left + 14, top + height), (left + 28, top + height), (left + 21, top + height + 11)], fill=fill)
    draw.polygon([(right - 28, top + height), (right - 14, top + height), (right - 21, top + height + 11)], fill=fill)
    img.alpha_composite(overlay)


def add_crown(img, *, x=26, y=8, width=76, height=34, fill=(245, 166, 35, 255)):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    base_y = y + height
    draw.rounded_rectangle((x, base_y - 10, x + width, base_y), radius=6, fill=fill)
    points = [
        (x + 4, base_y - 8),
        (x + 18, y + 6),
        (x + 34, base_y - 12),
        (x + width / 2, y),
        (x + width - 34, base_y - 12),
        (x + width - 18, y + 6),
        (x + width - 4, base_y - 8),
    ]
    draw.polygon(points, fill=fill)
    for gem_x in (x + 18, x + width / 2, x + width - 18):
        draw.ellipse((gem_x - 4, y + 5, gem_x + 4, y + 13), fill=(255, 239, 196, 255))
    img.alpha_composite(overlay)


def add_tray(img, *, left=14, top=24, right=114, bottom=104):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=14, fill=(62, 69, 76, 90), outline=(91, 98, 107, 160), width=4)
    draw.rounded_rectangle((left + 6, top + 6, right - 6, bottom - 6), radius=10, fill=(88, 96, 105, 30))
    img.alpha_composite(overlay)


def add_jar(img, *, left=28, top=18, right=102, bottom=108):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top + 14, right, bottom), radius=18, fill=(202, 235, 255, 52), outline=(210, 235, 255, 180), width=4)
    draw.rounded_rectangle((left + 8, top, right - 8, top + 20), radius=8, fill=(121, 155, 176, 210))
    draw.rectangle((left + 14, top + 6, right - 14, top + 13), fill=(86, 110, 128, 220))
    img.alpha_composite(overlay)


def add_crosshair(img, *, cx=64, cy=64, radius=46):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(196, 208, 222, 180), width=4)
    draw.line((cx - radius - 10, cy, cx - 18, cy), fill=(196, 208, 222, 180), width=4)
    draw.line((cx + 18, cy, cx + radius + 10, cy), fill=(196, 208, 222, 180), width=4)
    draw.line((cx, cy - radius - 10, cx, cy - 18), fill=(196, 208, 222, 180), width=4)
    draw.line((cx, cy + 18, cx, cy + radius + 10), fill=(196, 208, 222, 180), width=4)
    img.alpha_composite(overlay)


def add_chef_hat(img, *, x=70, y=8, scale=1.0):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    w = int(32 * scale)
    h = int(18 * scale)
    draw.rounded_rectangle((x + 4, y + h - 4, x + w - 4, y + h + 8), radius=5, fill=(245, 245, 240, 255), outline=(210, 210, 205, 255), width=2)
    for cx, cy, rr in [
        (x + 10, y + 10, 8),
        (x + 20, y + 6, 10),
        (x + 30, y + 10, 8),
    ]:
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(255, 255, 250, 255), outline=(220, 220, 216, 255), width=2)
    img.alpha_composite(overlay)


def add_cracks(img, lines, *, fill=(74, 42, 18, 150), width=3):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    for line in lines:
        draw.line(line, fill=fill, width=width, joint='curve')
    img.alpha_composite(overlay)


def add_steam(img, specs):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    for x, y0, y1 in specs:
        draw.arc((x - 8, y0, x + 8, y1), start=210, end=20, fill=(255, 242, 218, 180), width=3)
    img.alpha_composite(overlay)


def add_crate_frame(img):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((12, 12, 116, 116), radius=14, outline=(126, 80, 38, 255), width=8)
    draw.line((22, 34, 106, 94), fill=(154, 101, 52, 220), width=6)
    draw.line((22, 94, 106, 34), fill=(154, 101, 52, 220), width=6)
    img.alpha_composite(overlay)


def add_laurel(img, *, cx=64, cy=68, radius=42):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    for side in (-1, 1):
        for idx in range(6):
            angle = math.radians((145 + idx * 12) if side < 0 else (35 - idx * 12))
            px = cx + math.cos(angle) * radius
            py = cy + math.sin(angle) * radius
            box = (px - 8, py - 4, px + 8, py + 4)
            draw.ellipse(box, fill=(140, 178, 88, 210))
    img.alpha_composite(overlay)


def add_scroll_track(img, *, left=18, top=18, right=110, bottom=110):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=16, fill=(244, 232, 206, 80), outline=(176, 150, 110, 180), width=4)
    path = [
        (right - 20, top + 18),
        (72, 34),
        (44, 54),
        (82, 70),
        (58, 90),
        (34, bottom - 14),
    ]
    draw.line(path, fill=(120, 96, 70, 180), width=5, joint='curve')
    for px, py in path[1:-1]:
        draw.ellipse((px - 4, py - 4, px + 4, py + 4), fill=(245, 166, 35, 220))
    img.alpha_composite(overlay)


def add_shards(img, specs, *, fill=(201, 69, 69, 235), outline=(255, 226, 198, 120)):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    for points in specs:
        draw.polygon(points, fill=fill, outline=outline)
    img.alpha_composite(overlay)


def add_map_grid(img, *, left=16, top=16, right=112, bottom=112):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=16, outline=(129, 188, 207, 180), width=4)
    for x in (40, 64, 88):
        draw.line((x, top + 8, x, bottom - 8), fill=(129, 188, 207, 110), width=2)
    for y in (40, 64, 88):
        draw.line((left + 8, y, right - 8, y), fill=(129, 188, 207, 110), width=2)
    draw.line((32, 94, 54, 72, 74, 80, 96, 48), fill=(245, 166, 35, 180), width=4, joint='curve')
    draw.ellipse((90, 42, 102, 54), fill=(245, 166, 35, 220))
    img.alpha_composite(overlay)


def add_brick_wall(img, *, left=12, top=18, right=116, bottom=110):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=16, fill=(119, 86, 60, 68), outline=(144, 104, 74, 200), width=4)
    row_height = 18
    y = top + 10
    row = 0
    while y < bottom - 6:
        offset = 0 if row % 2 == 0 else 14
        x = left + 8 - offset
        while x < right - 10:
            draw.rounded_rectangle((x, y, x + 28, y + 12), radius=3, outline=(170, 130, 96, 110), width=2)
            x += 28
        y += row_height
        row += 1
    img.alpha_composite(overlay)


def add_sound_waves(img, *, cx=64, cy=64, color=(224, 238, 255, 130)):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    for radius in (28, 40, 52):
        draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), start=208, end=332, fill=color, width=3)
        draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), start=28, end=152, fill=color, width=3)
    img.alpha_composite(overlay)


def add_pedestal(img, *, left=20, top=90, right=108, bottom=114):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((left, top, right, bottom), radius=9, fill=(78, 82, 90, 180), outline=(132, 137, 146, 180), width=3)
    draw.rounded_rectangle((left + 12, top - 10, right - 12, top), radius=6, fill=(101, 106, 114, 180))
    img.alpha_composite(overlay)


def add_halo(img, *, cx=64, cy=52, radius=28):
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(255, 238, 188, 210), width=5)
    for angle in range(0, 360, 30):
        theta = math.radians(angle)
        x0 = cx + math.cos(theta) * (radius + 8)
        y0 = cy + math.sin(theta) * (radius + 8)
        x1 = cx + math.cos(theta) * (radius + 18)
        y1 = cy + math.sin(theta) * (radius + 18)
        draw.line((x0, y0, x1, y1), fill=(255, 228, 164, 170), width=3)
    img.alpha_composite(overlay)


def make_badge_first_bite():
    img = badge_canvas()
    add_sparkles(img, [(102, 24, 10, 4, 170), (90, 100, 7, 3, 130)])
    cookie = shadowed_cookie(110, bite=0.38, glow=0.10, crumb_level=0.22, chips_variant=0)
    img.alpha_composite(cookie, (10, 10))
    return img


def make_badge_bakers_dozen():
    img = badge_canvas()
    big = shadowed_cookie(94, bite=0.30, glow=0.08, crumb_level=0.16, chips_variant=1)
    small = shadowed_cookie(48, bite=0.24, glow=0.0, crumb_level=0.0, chips_variant=2)
    crumb = shadowed_cookie(34, bite=0.74, glow=0.0, crumb_level=0.12, chips_variant=0)
    img.alpha_composite(big, (12, 18))
    img.alpha_composite(small, (78, 70))
    img.alpha_composite(crumb, (70, 22))
    add_chef_hat(img, x=66, y=6, scale=0.95)
    return img


def make_badge_century():
    img = badge_canvas()
    add_ring(img, (12, 12, 116, 116), outline=(245, 166, 35, 120), width=9, blur=2)
    add_banner_ribbon(img, top=90, left=26, right=102, height=16, fill=(39, 112, 134, 255))
    for pos, variant in [((10, 28), 0), ((42, 10), 1), ((66, 42), 2)]:
        img.alpha_composite(shadowed_cookie(58, bite=0.30, glow=0.05, crumb_level=0.10, chips_variant=variant), pos)
    return img


def make_badge_quarter_crunch():
    img = badge_canvas()
    add_ring(img, (18, 18, 110, 110), outline=(245, 166, 35, 150), width=10, blur=1)
    img.alpha_composite(shadowed_cookie(72, bite=0.18, glow=0.04, crumb_level=0.04, chips_variant=0), (8, 30))
    img.alpha_composite(shadowed_cookie(56, bite=0.20, glow=0.06, crumb_level=0.06, chips_variant=1), (56, 18))
    add_sparkles(img, [(24, 20, 8, 3, 160)])
    return img


def make_badge_fifty_stack():
    img = badge_canvas()
    add_tray(img, left=10, top=44, right=118, bottom=108)
    for pos, size, variant in [((16, 50), 42, 0), ((42, 26), 48, 1), ((74, 52), 38, 2)]:
        img.alpha_composite(shadowed_cookie(size, bite=0.24, glow=0.06, crumb_level=0.08, chips_variant=variant), pos)
    return img


def make_badge_snack_attack():
    img = badge_canvas()
    add_sparkles(img, [(104, 18, 9, 3, 180), (20, 92, 7, 3, 140), (98, 62, 6, 2, 160)])
    img.alpha_composite(shadowed_cookie(76, bite=0.28, glow=0.08, crumb_level=0.12, chips_variant=1), (10, 14))
    img.alpha_composite(shadowed_cookie(40, bite=0.62, glow=0.0, crumb_level=0.14, chips_variant=0), (74, 76))
    img.alpha_composite(shadowed_cookie(32, bite=0.74, glow=0.0, crumb_level=0.16, chips_variant=2), (84, 22))
    return img


def make_badge_double_dip():
    img = badge_canvas()
    add_ring(img, (20, 28, 108, 116), outline=(88, 164, 204, 120), width=8, blur=2)
    for pos, variant in [((8, 28), 0), ((62, 28), 1)]:
        img.alpha_composite(shadowed_cookie(58, bite=0.34, glow=0.08, crumb_level=0.10, chips_variant=variant), pos)
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((14, 72, 112, 104), radius=14, fill=(106, 62, 30, 110))
    img.alpha_composite(overlay)
    return img


def make_badge_tray_tracker():
    img = badge_canvas()
    add_tray(img, left=12, top=18, right=116, bottom=112)
    img.alpha_composite(shadowed_cookie(84, bite=0.36, glow=0.08, crumb_level=0.14, chips_variant=1), (8, 22))
    img.alpha_composite(shadowed_cookie(34, bite=0.80, glow=0.0, crumb_level=0.16, chips_variant=0), (80, 18))
    img.alpha_composite(shadowed_cookie(34, bite=0.80, glow=0.0, crumb_level=0.16, chips_variant=2), (84, 76))
    return img


def make_badge_oven_regular():
    img = badge_canvas()
    overlay = Image.new('RGBA', img.size, C_BG)
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((16, 20, 112, 112), radius=16, fill=(70, 78, 87, 110), outline=(118, 126, 136, 180), width=5)
    draw.rounded_rectangle((28, 34, 100, 98), radius=10, fill=(255, 170, 92, 40), outline=(255, 204, 146, 120), width=3)
    img.alpha_composite(overlay)
    img.alpha_composite(shadowed_cookie(70, bite=0.22, glow=0.12, crumb_level=0.10, chips_variant=1), (29, 34))
    add_steam(img, [(42, 4, 30), (64, 0, 26), (86, 4, 30)])
    for x in (34, 56, 78, 100):
        draw.ellipse((x - 3, 100, x + 3, 106), fill=(224, 185, 112, 220))
    return img


def make_badge_five_hundred():
    img = badge_canvas()
    add_ring(img, (10, 10, 118, 118), outline=(245, 166, 35, 120), width=10, blur=3)
    giant = shadowed_cookie(106, bite=0.48, glow=0.12, crumb_level=0.48, chips_variant=1)
    img.alpha_composite(giant, (12, 12))
    add_cracks(img, [((48, 34), (60, 58), (46, 86)), ((76, 44), (64, 62), (86, 88))], width=4)
    return img


def make_badge_thousand():
    img = badge_canvas()
    add_crosshair(img, cx=64, cy=64, radius=46)
    img.alpha_composite(shadowed_cookie(84, bite=0.34, glow=0.12, crumb_level=0.20, chips_variant=1), (22, 22))
    return img


def make_badge_jar_raider():
    img = badge_canvas()
    add_jar(img)
    img.alpha_composite(shadowed_cookie(42, bite=0.28, glow=0.06, crumb_level=0.10, chips_variant=0), (20, 58))
    img.alpha_composite(shadowed_cookie(46, bite=0.32, glow=0.08, crumb_level=0.14, chips_variant=1), (42, 36))
    img.alpha_composite(shadowed_cookie(40, bite=0.38, glow=0.08, crumb_level=0.16, chips_variant=2), (66, 58))
    return img


def make_badge_batch_boss():
    img = badge_canvas()
    add_banner_ribbon(img, top=88, left=16, right=112, height=18, fill=(155, 49, 76, 255))
    for pos, size, variant in [
        ((8, 28), 40, 0),
        ((34, 12), 46, 1),
        ((70, 28), 40, 2),
        ((22, 70), 34, 1),
        ((72, 72), 30, 0),
    ]:
        img.alpha_composite(shadowed_cookie(size, bite=0.34, glow=0.08, crumb_level=0.16, chips_variant=variant), pos)
    return img


def make_badge_crate_cracker():
    img = badge_canvas()
    add_crate_frame(img)
    for pos, size, bite, variant in [
        ((12, 34), 34, 0.18, 0),
        ((34, 16), 38, 0.22, 1),
        ((64, 26), 40, 0.30, 2),
        ((22, 72), 28, 0.64, 0),
        ((62, 76), 26, 0.72, 1),
        ((90, 54), 20, 0.78, 2),
    ]:
        img.alpha_composite(shadowed_cookie(size, bite=bite, glow=0.08, crumb_level=0.18, chips_variant=variant), pos)
    return img


def make_badge_five_thousand():
    img = badge_canvas()
    add_laurel(img)
    add_ring(img, (18, 18, 110, 110), outline=C_AMBER_SOFT, width=8, blur=2)
    img.alpha_composite(shadowed_cookie(92, bite=0.54, glow=0.18, crumb_level=0.60, chips_variant=2), (18, 18))
    return img


def make_badge_ten_thousand():
    img = badge_canvas()
    add_crown(img, x=24, y=6, width=80, height=34)
    add_sparkles(img, [(16, 32, 8, 3, 180), (108, 32, 8, 3, 180), (64, 112, 7, 3, 150)])
    img.alpha_composite(shadowed_cookie(82, bite=0.38, glow=0.14, crumb_level=0.24, chips_variant=1), (23, 34))
    return img


def make_badge_scroll_stomper():
    img = badge_canvas()
    add_scroll_track(img)
    add_ring(img, (20, 20, 108, 108), outline=(245, 166, 35, 90), width=8, blur=2)
    img.alpha_composite(shadowed_cookie(74, bite=0.40, glow=0.12, crumb_level=0.24, chips_variant=2), (26, 30))
    img.alpha_composite(shadowed_cookie(30, bite=0.78, glow=0.0, crumb_level=0.18, chips_variant=0), (72, 78))
    return img


def make_badge_bannerbreaker():
    img = badge_canvas()
    add_ring(img, (12, 12, 116, 116), outline=(190, 72, 72, 90), width=8, blur=3)
    img.alpha_composite(shadowed_cookie(92, bite=0.46, glow=0.14, crumb_level=0.42, chips_variant=1), (18, 18))
    add_banner_ribbon(img, top=56, left=14, right=114, height=20, fill=(187, 56, 71, 255))
    add_cracks(img, [((24, 50), (42, 64), (56, 82)), ((74, 48), (62, 66), (78, 86)), ((54, 46), (64, 60), (58, 76))], fill=(255, 236, 218, 180), width=4)
    add_shards(img, [
        [(20, 74), (34, 60), (38, 82)],
        [(92, 54), (106, 50), (98, 70)],
        [(56, 84), (68, 70), (74, 92)],
    ])
    return img


def make_badge_consent_cartographer():
    img = badge_canvas()
    add_map_grid(img)
    add_crosshair(img, cx=64, cy=64, radius=42)
    img.alpha_composite(shadowed_cookie(66, bite=0.26, glow=0.10, crumb_level=0.10, chips_variant=0), (31, 31))
    add_sparkles(img, [(102, 20, 8, 3, 150), (20, 106, 7, 3, 120)])
    return img


def make_badge_wall_whisperer():
    img = badge_canvas()
    add_brick_wall(img)
    add_sound_waves(img)
    img.alpha_composite(shadowed_cookie(78, bite=0.34, glow=0.10, crumb_level=0.16, chips_variant=2), (24, 24))
    add_sparkles(img, [(20, 20, 7, 3, 120), (108, 20, 7, 3, 120)])
    return img


def make_badge_crumb_colossus():
    img = badge_canvas()
    add_pedestal(img)
    add_laurel(img, cy=74, radius=46)
    add_ring(img, (10, 10, 118, 118), outline=(255, 214, 142, 100), width=10, blur=3)
    img.alpha_composite(shadowed_cookie(104, bite=0.58, glow=0.22, crumb_level=0.82, chips_variant=1), (12, 2))
    return img


def make_badge_mythic_muncher():
    img = badge_canvas()
    add_halo(img, cx=64, cy=52, radius=28)
    add_crown(img, x=22, y=4, width=84, height=36, fill=(255, 201, 72, 255))
    add_laurel(img, cy=76, radius=44)
    add_sparkles(img, [(18, 34, 9, 3, 190), (110, 34, 9, 3, 190), (20, 108, 8, 3, 160), (108, 108, 8, 3, 160)])
    img.alpha_composite(shadowed_cookie(86, bite=0.62, glow=0.24, crumb_level=0.92, chips_variant=2), (21, 28))
    return img


def generate_static_icons():
    print('Static icons:')
    for size in (16, 32, 48, 128):
        save(draw_cookie(size, bite=0.42, glow=0.10, crumb_level=0.16, angle_deg=-32, chips_variant=1), ICONS_DIR / f'icon-{size}.png')


def generate_frames():
    print('\nAnimation frames:')
    frames = [
        dict(bite=0.08, glow=0.00, crumb_level=0.00, angle_deg=-32, chips_variant=1),
        dict(bite=0.18, glow=0.08, crumb_level=0.02, angle_deg=-32, chips_variant=1),
        dict(bite=0.30, glow=0.14, crumb_level=0.12, angle_deg=-32, chips_variant=1),
        dict(bite=0.44, glow=0.20, crumb_level=0.30, angle_deg=-32, chips_variant=1),
        dict(bite=0.58, glow=0.18, crumb_level=0.54, angle_deg=-32, chips_variant=1),
        dict(bite=0.72, glow=0.10, crumb_level=0.82, angle_deg=-32, chips_variant=1),
        dict(bite=0.86, glow=0.04, crumb_level=1.00, angle_deg=-32, chips_variant=1),
        dict(bite=0.42, glow=0.00, crumb_level=0.16, angle_deg=-32, chips_variant=1),
    ]
    for idx, params in enumerate(frames, 1):
        save(draw_cookie(32, **params), FRAMES_DIR / f'frame-{idx}.png')


def generate_badges():
    print('\nBadge icons:')
    badge_builders = {
        'first-bite.png': make_badge_first_bite,
        'bakers-dozen.png': make_badge_bakers_dozen,
        'quarter-crunch.png': make_badge_quarter_crunch,
        'fifty-stack.png': make_badge_fifty_stack,
        'snack-attack.png': make_badge_snack_attack,
        'century-crumbler.png': make_badge_century,
        'double-dip.png': make_badge_double_dip,
        'tray-tracker.png': make_badge_tray_tracker,
        'oven-regular.png': make_badge_oven_regular,
        'cookie-crusher.png': make_badge_five_hundred,
        'terminator.png': make_badge_thousand,
        'jar-raider.png': make_badge_jar_raider,
        'batch-boss.png': make_badge_batch_boss,
        'crate-cracker.png': make_badge_crate_cracker,
        'unstoppable.png': make_badge_five_thousand,
        'legend.png': make_badge_ten_thousand,
        'scroll-stomper.png': make_badge_scroll_stomper,
        'bannerbreaker.png': make_badge_bannerbreaker,
        'consent-cartographer.png': make_badge_consent_cartographer,
        'wall-whisperer.png': make_badge_wall_whisperer,
        'crumb-colossus.png': make_badge_crumb_colossus,
        'mythic-muncher.png': make_badge_mythic_muncher,
    }
    for name, builder in badge_builders.items():
        save(builder(), BADGES_DIR / name)


if __name__ == '__main__':
    generate_static_icons()
    generate_frames()
    generate_badges()
    print('\nAll done.')
