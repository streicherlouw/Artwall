#!/usr/bin/env python3
"""Native SDL2 tile renderer. Cached textures; no browser, DOM or continuous redraw."""
import os
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'
import json
import math
import queue
import sys
import threading
import time
import pygame
from pygame._sdl2.video import Window, Renderer, Texture
from flap_audio import FlapAudio
from motion import WheelMotion, WHEEL, pose

COLORS = {'⬜': '#e8e8dd', '🟥': '#d24a3f', '🟧': '#e28a35', '🟨': '#e9ce4b',
          '🟩': '#59a363', '🟦': '#4a7bbc', '🟪': '#8c5fbb'}

def main():
    config = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    columns, rows = config.get('columns', 24), config.get('rows', 9)
    fps = max(24, min(60, config.get('fps', 60)))
    flip_ms = max(30, min(150, config.get('flipDuration', 45)))
    cadence_ms = max(flip_ms + 5, config.get('cadence', 50))
    animate = config.get('animate', True)
    pygame.display.init()
    pygame.font.init()
    size = pygame.display.get_desktop_sizes()[0]
    window = Window('SplitFlap', size=size, fullscreen_desktop=True, borderless=True)
    renderer = Renderer(window, accelerated=1, vsync=False, target_texture=True)
    pygame.mouse.set_visible(False)
    width, height = window.size
    gap = max(2, round(width * .0027))
    tile_w = max(4, (width - (columns + 1) * gap) // columns)
    tile_h = max(4, (height - (rows + 1) * gap) // rows)
    half = tile_h // 2
    font = pygame.font.Font('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', int(min(tile_w * 1.15, tile_h * .69)))
    cap_height = font.render("H", True, "white").get_bounding_rect().height
    swatch_size = max(1, min(cap_height, tile_w - 4, tile_h - 4))
    cache = {}
    rects = []
    for i in range(columns * rows):
        x = gap + round((i % columns) * (width - gap) / columns)
        y = gap + round((i // columns) * (height - gap) / rows)
        rects.append(pygame.Rect(x, y, tile_w, tile_h))

    def texture(char):
        if char not in cache:
            surface = pygame.Surface((tile_w, tile_h), depth=32)
            base = pygame.Color('#282b2b')
            surface.fill(base)
            pygame.draw.rect(surface, tuple(max(0, c - 5) for c in base[:3]), (0, 0, tile_w, half))
            if char in COLORS:
                swatch = pygame.Rect(0, 0, swatch_size, swatch_size)
                swatch.center = (tile_w // 2, tile_h // 2)
                pygame.draw.rect(surface, COLORS[char], swatch)
            elif char != ' ':
                glyph = font.render(char, True, '#e6e6da')
                surface.blit(glyph, glyph.get_rect(center=(tile_w // 2, tile_h // 2)))
            pygame.draw.line(surface, '#0a0b0b', (0, half), (tile_w, half), max(1, width // 960))
            pygame.draw.rect(surface, '#171919', surface.get_rect(), 1, border_radius=2)
            cache[char] = Texture.from_surface(renderer, surface)
        return cache[char]

    commands = queue.Queue(maxsize=8)
    def read_commands():
        for line in sys.stdin:
            try:
                value = json.loads(line)
                commands.put(value)
            except (ValueError, TypeError):
                continue
        commands.put({'type': 'quit'})
    threading.Thread(target=read_commands, daemon=True).start()
    motion = WheelMotion(columns * rows, flip_ms, cadence_ms)
    audio = FlapAudio(pygame, lambda message: print(json.dumps({"event": "audio", "message": message}), flush=True))
    page_list = [motion.values[:]]
    page_index = 0
    message_id = None
    page_seconds = max(2, config.get('pageDuration', 10000) / 1000)
    next_page = float('inf')
    dirty = True
    running = True
    frames = 0
    render_ms = []
    start_time = time.monotonic()
    snapshot = config.get('snapshotPath')  # Optional diagnostic of this renderer only.

    # Build every wheel face once, before starting the animation clock.
    for character in WHEEL:
        texture(character)
    canvas = Texture(renderer, (width, height), target=True)
    renderer.target = canvas
    renderer.draw_color = (8, 10, 10, 255)
    renderer.clear()
    for rect in rects:
        texture(' ').draw(dstrect=rect)
    renderer.target = None
    repaint_all = True
    moving_face = Texture(renderer, (tile_w, tile_h), target=True)

    def set_page(values, instant=False):
        nonlocal dirty, repaint_all
        for value in values:
            texture(value)
        audio.stop()
        motion.begin(values, time.monotonic(), animate and not instant)
        dirty = True
        repaint_all = True

    def face(char, source, destination, shade=0.):
        tex = texture(char)
        tint = round(255 * (1 - shade))
        tex.color = (tint, tint, tint)
        tex.draw(srcrect=source, dstrect=destination)
        tex.color = (255, 255, 255)

    fade_seconds = 0.9
    opened_at = time.monotonic()
    suspended_at = None
    closing_at = None
    was_fading = True

    def draw(now):
        nonlocal frames, repaint_all
        draw_start = time.monotonic()
        # Synchronized wheels often show the same pair on many tiles. Compose
        # that moving face once, then copy it to every matching cell as a batch.
        indices = list(range(len(rects))) if repaint_all else list(motion.plans)
        groups = {}
        for i in indices:
            old, new, progress = motion.sample(i, now)
            key = (new, new, 1.) if old == new or progress >= 1 else (old, new, progress)
            groups.setdefault(key, []).append(rects[i])
        for (old, new, progress), destinations in groups.items():
            if old == new:
                renderer.target = canvas
                tex = texture(new)
                for rect in destinations:
                    tex.draw(dstrect=rect)
                continue
            renderer.target = moving_face
            angle, shade = pose(progress)
            face(new, (0, 0, tile_w, half), (0, 0, tile_w, half))
            face(old, (0, half, tile_w, tile_h-half), (0, half, tile_w, tile_h-half), shade)
            if angle <= math.pi / 2:
                h = max(1, round(half * math.cos(angle)))
                face(old, (0, 0, tile_w, half), (0, half-h, tile_w, h), shade)
            else:
                h = max(1, round((tile_h-half) * -math.cos(angle)))
                face(new, (0, half, tile_w, tile_h-half), (0, half, tile_w, h), shade)
            renderer.draw_color = (8, 10, 10, 255)
            renderer.fill_rect((0, half-1, tile_w, max(1, width//960)))
            renderer.target = canvas
            for rect in destinations:
                moving_face.draw(dstrect=rect)
        renderer.target = None
        brightness = min(1.0, max(0.0, (now - opened_at) / fade_seconds))
        if closing_at is not None:
            brightness *= max(0.0, 1.0 - (now - closing_at) / fade_seconds)
        brightness = brightness * brightness * (3.0 - 2.0 * brightness)
        level = round(255 * brightness)
        canvas.color = (level, level, level)
        canvas.draw()
        if snapshot and not motion.plans:
            pygame.image.save(renderer.to_surface(), snapshot)
        renderer.present()
        repaint_all = False
        frames += 1
        render_ms.append((time.monotonic() - draw_start) * 1000)

    draw(time.monotonic())
    print(json.dumps({'event': 'ready', 'width': width, 'height': height, 'fpsCap': fps}), flush=True)
    while running:
        tick = time.monotonic()
        for event in pygame.event.get():
            if event.type == pygame.QUIT or event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False
            elif event.type in (pygame.WINDOWEXPOSED, pygame.WINDOWSHOWN):
                dirty = True
        while not commands.empty():
            command = commands.get_nowait()
            if command.get('type') == 'suspend':
                if suspended_at is None:
                    suspended_at = time.monotonic()
                    audio.enable(False)
                    window.hide()
            elif command.get('type') == 'resume':
                if suspended_at is not None:
                    elapsed = time.monotonic() - suspended_at
                    motion.start += elapsed
                    next_page += elapsed
                    opened_at += elapsed
                    suspended_at = None
                    audio.enable(command.get('sound', False))
                    window.show()
                    dirty = True
            elif command.get('type') == 'quit':
                if suspended_at is not None:
                    running = False
                    suspended_at = None
                if closing_at is None:
                    closing_at = time.monotonic()
            elif command.get('type') == 'show':
                pages = command.get('pages', [])
                if pages and all(isinstance(p, list) and len(p) == len(motion.values) for p in pages):
                    audio.enable(command.get("sound", False))
                    message_id = command.get("id")
                    page_list = pages
                    page_index = 0
                    set_page(pages[0], command.get("instant", False))
                    next_page = time.monotonic() + page_seconds + max((len(p[1]) for p in motion.plans.values()), default=0) * motion.cadence
        if suspended_at is not None:
            time.sleep(.05)
            continue
        if len(page_list) > 1 and tick >= next_page:
            page_index = (page_index + 1) % len(page_list)
            set_page(page_list[page_index])
            next_page = time.monotonic() + page_seconds + max((len(p[1]) for p in motion.plans.values()), default=0) * motion.cadence
        audio.update(motion, tick)
        fading = tick < opened_at + fade_seconds or closing_at is not None
        if dirty or motion.plans or fading or was_fading:
            draw(tick)
            dirty = False
            if not motion.plans and not fading:
                print(json.dumps({'event': 'settled', 'id': message_id, 'page': page_index, 'frames': frames,
                                  'maxDrawMs': round(max(render_ms), 2),
                                  'meanDrawMs': round(sum(render_ms) / len(render_ms), 2)}), flush=True)
                render_ms.clear()
        was_fading = fading
        if closing_at is not None and tick >= closing_at + fade_seconds:
            running = False
        time.sleep(max(0.001, (1 / fps if motion.plans or fading else .1) - (time.monotonic() - tick)))
    print(json.dumps({'event': 'closed', 'frames': frames, 'seconds': round(time.monotonic() - start_time, 2)}), flush=True)
    audio.stop()
    cache.clear()
    del moving_face
    del canvas
    del renderer
    window.destroy()
    pygame.quit()

if __name__ == '__main__':
    main()
