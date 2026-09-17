"""Repository integration test: compare the Python and Node.js reference ports."""

import json
from pathlib import Path
import random
import shutil
import subprocess
import unittest

from collinear_fractals import inverse_iteration_test


@unittest.skipUnless(shutil.which("node"), "Node.js is required for the cross-language integration test")
class TestReferencePortAgreement(unittest.TestCase):
    def test_seeded_corpus(self):
        root = Path(__file__).resolve().parents[1]
        if not (root / "javascript" / "index.js").is_file():
            self.skipTest("run this integration test from a repository checkout")
        cases = [[1.419643377607, 0.606290729207, 3, depth, limit]
                 for depth in (0, 1, 2, 10) for limit in (1, 3, 100)]
        cases.extend([[1.1, 5e-324, 2, 2, 20], [1e308, 1e308, 3, 2, 20],
                      [0, 1, 3, 2, 20], [0.2, 0.3, 3, 2, 20]])
        rng = random.Random(20260917)
        for _ in range(120):
            x, y = rng.uniform(-3, 3), rng.uniform(-2.5, 2.5)
            cases.append([x, y, rng.choice((2, 3, 4, 8)), rng.choice((0, 2, 12)), rng.choice((1, 8, 100))])
        script = """
const fs = require('node:fs');
const cf = require('./javascript/index.js');
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(args => cf.inverseIterationTest(...args))));
"""
        completed = subprocess.run(["node", "-e", script], input=json.dumps(cases), text=True,
                                   capture_output=True, check=True, cwd=root, timeout=30)
        node_results = json.loads(completed.stdout)
        self.assertEqual(len(node_results), len(cases))
        for case, js in zip(cases, node_results):
            x, y, n, depth, limit = case
            py = inverse_iteration_test(complex(x, y), n, depth, limit)
            with self.subTest(case=case):
                self.assertEqual(py["verdict"], js["verdict"])
                self.assertEqual(py["depth"], js["depth"])
                self.assertEqual(py["nodes_explored"], js["nodesExplored"])
                self.assertEqual(py["stop_reason"], js["stopReason"])
                self.assertEqual(py["word"], js["word"])


if __name__ == "__main__":
    unittest.main()
