import math
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'standalone'))
from motion import WHEEL, WheelMotion, route, pose

class MotionTests(unittest.TestCase):
    def test_forward_wheel_and_wrap(self):
        self.assertEqual(route('A', 'D'), ('B', 'C', 'D'))
        self.assertEqual(route('🟪', 'A'), (' ', 'A'))
        self.assertEqual(route('A', 'A'), ())
        self.assertEqual(route(' ', '🟪'), WHEEL[1:])

    def test_all_destinations_stop_exactly_at_target(self):
        for old in WHEEL:
            for new in WHEEL:
                steps = route(old, new)
                self.assertLess(len(steps), len(WHEEL))
                if steps:
                    self.assertEqual(steps[-1], new)

    def test_tiles_share_clock_and_stop_independently(self):
        motion = WheelMotion(2)
        motion.begin(['A', 'D'], 10)
        self.assertEqual(motion.sample(0, 10.057)[:2], (' ', 'A'))
        self.assertEqual(motion.sample(1, 10.057)[:2], (' ', 'A'))
        self.assertEqual(motion.sample(0, 10.083), ('A', 'A', 1))
        self.assertEqual(motion.sample(1, 10.083)[:2], ('A', 'B'))
        self.assertEqual(motion.sample(1, 10.233), ('D', 'D', 1))
        self.assertEqual(motion.plans, {})

    def test_retarget_uses_landed_face_not_abandoned_target(self):
        motion = WheelMotion(1)
        motion.begin(['Z'], 0)
        motion.begin(['C'], .11)  # A landed; B is still falling.
        self.assertEqual(motion.values, ['A'])
        self.assertEqual(motion.plans[0], ('A', ('B', 'C')))

    def test_pose_accelerates_and_bounces(self):
        self.assertEqual(pose(0), (0, 0))
        self.assertAlmostEqual(pose(.5)[0], math.pi/2)
        self.assertGreater(pose(.88)[0], math.pi)
        self.assertAlmostEqual(pose(1)[0], math.pi)
        self.assertLess(pose(.25)[0], math.pi/4)
        self.assertAlmostEqual(pose(.5)[1], .42)

    def test_stalled_frame_lands_on_time_and_instant_mode(self):
        motion = WheelMotion(1)
        motion.begin(['Z'], 0)
        self.assertEqual(motion.sample(0, 20), ('Z', 'Z', 1))
        motion.begin(['B'], 21, False)
        self.assertEqual(motion.values, ['B'])
        self.assertFalse(motion.plans)

if __name__ == '__main__':
    unittest.main()
