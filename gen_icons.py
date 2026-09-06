#!/usr/bin/env python3
"""Generate simple PNG icons without external deps (pure zlib+struct)."""
import struct, zlib, pathlib

def png(w, h, rgba_fn):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter none
        for x in range(w):
            raw.extend(rgba_fn(x, y, w, h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")

def color(x, y, w, h):
    # rounded blue bg
    cx, cy = w/2, h/2
    nx, ny = (x - cx) / (w*0.42), (y - cy) / (h*0.42)
    # soft round rect-ish
    r = (abs(nx)**4 + abs(ny)**4) ** 0.25
    if r > 1.05:
        return (0, 0, 0, 0)
    # gradient bg
    t = y / h
    br = int(42 + (13-42)*t)
    bg = int(90 + (40-90)*t)
    bb = int(158 + (72-158)*t)
    # blue units
    units = [
        (0.35, 0.52, 0.09, (51,170,255)),
        (0.48, 0.55, 0.075, (42,160,255)),
        (0.62, 0.50, 0.07, (238,51,51)),
    ]
    for ux, uy, ur, col in units:
        dx = x/w - ux
        dy = y/h - uy
        if dx*dx + dy*dy < ur*ur:
            return (*col, 255)
        if dx*dx + (dy+ur*0.7)**2 < (ur*0.75)**2:
            return (*col, 255)
    if r > 0.98:
        return (255, 255, 255, 200)
    return (br, bg, bb, 255)

out = pathlib.Path(__file__).parent
for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    data = png(size, size, color)
    (out / name).write_bytes(data)
    print("wrote", name, len(data), "bytes")
