"""Original synthesized flap clatter; no downloaded recordings or audio dependencies."""
from array import array
import math
import random

RATE = 22050

def clatter(voices=1, seed=0):
    """A 40 ms mono PCM burst: dry attack, short body, quieter second impact."""
    rng = random.Random(seed)
    samples = [0.0] * int(RATE * .04)
    for _ in range(voices):
        offset = rng.randrange(int(RATE * .007) + 1)
        frequency = rng.uniform(1100, 2300)
        previous = 0.0
        for i in range(len(samples) - offset):
            t = i / RATE
            noise = rng.uniform(-1, 1)
            high = noise - previous * .75
            previous = noise
            attack = min(1, t / .0004)
            snap = high * math.exp(-t / .0028)
            body = .22 * math.sin(2 * math.pi * frequency * t) * math.exp(-t / .007)
            after = .3 * high * math.exp(-(t - .009) / .002) if t >= .009 else 0
            samples[offset + i] += attack * (snap + body + after) / math.sqrt(voices)
    peak = max(1.0, max(abs(v) for v in samples))
    return array('h', (round(v / peak * 20000) for v in samples)).tobytes()

def active_step(motion, now):
    if now < motion.start:
        return -1, 0
    step = int((now - motion.start) / motion.cadence)
    count = sum(len(plan[1]) > step for plan in motion.plans.values())
    return step, count

class FlapAudio:
    def __init__(self, pygame, report=print):
        self.pygame = pygame
        self.report = report
        self.enabled = False
        self.failed = False
        self.samples = {}
        self.channel = None
        self.last = None

    def enable(self, enabled):
        self.stop()
        self.enabled = bool(enabled) and not self.failed
        if self.enabled and not self.samples:
            try:
                self.pygame.mixer.init(frequency=RATE, size=-16, channels=1, buffer=512,
                                       allowedchanges=0)
                self.channel = self.pygame.mixer.Channel(0)
                for density in (1, 4, 10):
                    self.samples[density] = [
                        self.pygame.mixer.Sound(buffer=clatter(density, variant + density * 31))
                        for variant in range(4)]
                self.report('Audio ready: synthesized flap clatter')
            except Exception as error:
                self.enabled = False
                self.failed = True
                self.report('Audio unavailable; continuing silently: ' + str(error))

    def stop(self):
        if self.channel:
            self.channel.stop()
        self.last = None

    def update(self, motion, now):
        if not self.enabled:
            return
        step, count = active_step(motion, now)
        if step < 0:
            return
        if not count:
            self.stop()
            return
        marker = (motion.start, step)
        if marker == self.last:
            return
        self.last = marker
        density = 1 if count < 4 else 4 if count < 16 else 10
        # One bounded channel, rather than hundreds of simultaneous tile sounds.
        self.channel.set_volume(.18 + .12 * min(1, count / 40))
        self.channel.play(self.samples[density][step % 4])
