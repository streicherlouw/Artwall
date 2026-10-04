"""Character-wheel timing and mechanical pose, independent of graphics."""
import math

WHEEL = tuple(' ⬜🟥🟧🟨🟩🟦🟪') + tuple('ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ0123456789.,!?&+-/:;@#\'"()=£$%°')

def route(start, target):
    if start == target:
        return ()
    # Additional supported symbols follow the standard wheel.
    wheel = list(WHEEL)
    for character in (start, target):
        if character not in wheel:
            wheel.append(character)
    origin = wheel.index(start)
    count = (wheel.index(target) - origin) % len(wheel)
    return tuple(wheel[(origin + i + 1) % len(wheel)] for i in range(count))

def pose(progress):
    p = max(0., min(1., progress))
    if p < .5:
        degrees = 90 * (2 * p) ** 1.5
    elif p < .88:
        degrees = 90 + 94 * math.sin((p - .5) * math.pi / .76)
    else:
        degrees = 180 + 4 * ((1 - p) / .12) ** 2
    return math.radians(degrees), .42 * math.sin(math.pi * p)

class WheelMotion:
    def __init__(self, count, flip_ms=45, cadence_ms=50):
        self.flip = flip_ms / 1000
        self.cadence = cadence_ms / 1000
        self.values = [' '] * count
        self.plans = {}
        self.start = 0

    def completed(self, plan, now):
        initial, steps = plan
        elapsed = max(0., now - self.start)
        step = int(elapsed / self.cadence)
        phase = elapsed - step * self.cadence
        done = min(len(steps), step + (phase >= self.flip))
        return steps[done - 1] if done else initial

    def begin(self, targets, now, animate=True):
        # Retarget from the last landed character, never the abandoned target.
        for index, plan in self.plans.items():
            self.values[index] = self.completed(plan, now)
        self.plans = {}
        if animate:
            for index, target in enumerate(targets):
                steps = route(self.values[index], target)
                if steps:
                    self.plans[index] = (self.values[index], steps)
        else:
            self.values[:] = targets
        self.start = now + .032

    def sample(self, index, now):
        plan = self.plans.get(index)
        if not plan:
            return self.values[index], self.values[index], 1.
        initial, steps = plan
        elapsed = max(0., now - self.start)
        step = int(elapsed / self.cadence)
        if step >= len(steps):
            self.values[index] = steps[-1]
            del self.plans[index]
            return steps[-1], steps[-1], 1.
        old = steps[step - 1] if step else initial
        progress = min(1., (elapsed - step * self.cadence) / self.flip)
        return old, steps[step], progress
