# Split-flap sound design

The sound is an original synthesis, not a recording or an exact reconstruction of a particular board.

## Research

- Manufacturer [Oat Foundry describes split-flap sound](https://www.oatfoundry.com/kinetic-signage/) as soft clicking while messages fall into place, and explains the motor-driven carousel mechanism.
- [G000ze's physical split-flap build](https://github.com/g000ze/Split-Flap-Display) explicitly aims to retain flap clatter while quieting its stepper motors. This supports focusing the effect on impacts rather than a continuous motor hum.
- [Pygame mixer documentation](https://www.pygame.org/docs/ref/mixer.html) describes cached Sound buffers, channels and background mixing. We use the existing installed pygame mixer rather than adding an audio process.

## Interpretation and implementation

Each cached 40 ms burst contains a filtered noise attack, a short damped body resonance and a quieter secondary impact. Several slightly offset voices suggest independent mechanical flaps without multiplying playback channels by the number of display tiles. Four deterministic variations reduce repetition. Three density levels follow the number of tiles still moving; amplitude is bounded and mixed at a modest level.

The renderer derives playback steps from the actual wheel clock. It starts only when animation begins, emits at most one burst per observed wheel step, skips missed audio rather than queueing catch-up clicks, and stops on replacement, settlement or shutdown. Sound is optional per request and defaults off. The six-second screen wake hold remains silent.

The sounds are generated once on first use in each native renderer session and cached. A failed audio device initialization is logged once, then rendering continues without sound. Output hardware and its volume are managed by the Pi's normal audio configuration.
