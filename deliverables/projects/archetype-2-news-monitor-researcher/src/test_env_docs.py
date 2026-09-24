#!/usr/bin/env python3
"""`.env.example` must name every variable the code reads, and nothing else.

Ported from archetype 3's `env.test.ts` and archetype 5's `infra/env.test.mjs`.
It runs in both directions deliberately. A variable the code reads and the
example omits is the expensive one — it is invisible until a run fails in an
environment where nobody knew to set it, which is exactly how GITHUB_REPOSITORY
went undocumented. A variable the example names and no code reads is the cheap
one, but it is still a lie in the file people copy.
"""

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
SOURCES = [PROJECT_ROOT / "src" / "watcher.py"]

# Variables the code reads that are deliberately absent from .env.example.
EXEMPT = {
    # Set by demo/run-demo.sh for the duration of the demo. Documenting it in
    # the file people copy into a real .env would invite switching it on, and
    # it is the gate that keeps file:// out of a live run.
    "DEMO_FIXTURES",
}

_READ = re.compile(r'os\.environ(?:\.get)?[\(\[]\s*["\']([A-Z][A-Z0-9_]*)["\']')
_DOCUMENTED = re.compile(r'^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=', re.MULTILINE)


def _read_by_code() -> set[str]:
    names: set[str] = set()
    for path in SOURCES:
        names |= set(_READ.findall(path.read_text()))
    return names - EXEMPT


def _documented() -> set[str]:
    return set(_DOCUMENTED.findall(ENV_EXAMPLE.read_text()))


class TestEnvExampleInSync(unittest.TestCase):
    def test_example_file_exists(self):
        self.assertTrue(ENV_EXAMPLE.exists(), f"{ENV_EXAMPLE} is missing")

    def test_the_regexes_actually_match_something(self):
        # Guards against the whole suite passing vacuously if either pattern
        # stops matching — two empty sets are always in sync.
        self.assertGreater(len(_read_by_code()), 5)
        self.assertGreater(len(_documented()), 5)

    def test_every_variable_the_code_reads_is_documented(self):
        missing = sorted(_read_by_code() - _documented())
        self.assertEqual(
            missing, [],
            f"read by the code but absent from .env.example: {', '.join(missing)}",
        )

    def test_every_documented_variable_is_read_by_the_code(self):
        unused = sorted(_documented() - _read_by_code())
        self.assertEqual(
            unused, [],
            f"documented in .env.example but never read: {', '.join(unused)}",
        )


if __name__ == "__main__":
    unittest.main()
