#!/usr/bin/env python3
"""Byte-exact JSON formatting fingerprints.

Several trees in this repo hold JSON written by different tools with different
`json.dumps` settings, and `agency/work/*.json` bytes are what actually ship
(`agency/install.py` copies them verbatim). Rewriting a file with the wrong
settings silently changes every byte. This module detects a file's existing
format and reproduces it exactly, so a translator can replace values without
reformatting anything.

A fingerprint is a 4-tuple `(ensure_ascii, indent, compact, trailing_nl)`:

    ensure_ascii  bool        non-ASCII escaped as \\uXXXX
    indent        int|str|None  json.dumps indent (None = single line)
    compact       bool        separators=(',', ':') instead of the defaults
    trailing_nl   bool        file ends with a single '\\n'

Usage:
    obj, fp = load_fp(path)
    obj['k'] = 'new value'
    path.write_bytes(dump_fp(obj, fp))      # byte-identical except that value

`fingerprint()` returns None for bytes no setting combination reproduces; the
caller decides whether that is fatal or warrants a logged fallback.
"""
import json
import pathlib

__all__ = ['fingerprint', 'load_fp', 'dump_fp', 'render', 'CANDIDATES']

# Ordered so the most common real-world forms match first. `compact` only
# differs from the default when indent is None, so it is tried just there.
_INDENTS = (0, 1, 2, 4, 3, 8, '\t', None)
CANDIDATES = tuple(
    (ea, ind, comp)
    for ea in (False, True)
    for ind in _INDENTS
    for comp in ((False, True) if ind is None else (False,))
)


def render(obj, fp) -> bytes:
    """Serialize `obj` under fingerprint `fp`. Inverse of `fingerprint`."""
    ensure_ascii, indent, compact, trailing_nl = fp
    s = json.dumps(
        obj,
        ensure_ascii=ensure_ascii,
        indent=indent,
        separators=(',', ':') if compact else None,
    )
    return s.encode('utf-8') + (b'\n' if trailing_nl else b'')


dump_fp = render  # alias: dump_fp(obj, fp) reads better at call sites


def fingerprint(data: bytes):
    """Detect the fingerprint of `data`, or None if no combination matches.

    Raises ValueError if `data` is not valid JSON (callers want that loud).
    """
    obj = json.loads(data.decode('utf-8'))
    for trailing_nl in (data.endswith(b'\n'), not data.endswith(b'\n')):
        for ensure_ascii, indent, compact in CANDIDATES:
            fp = (ensure_ascii, indent, compact, trailing_nl)
            if render(obj, fp) == data:
                return fp
    return None


def load_fp(path):
    """Return `(obj, fp)` for a JSON file. `fp` is None if unreproducible."""
    data = pathlib.Path(path).read_bytes()
    return json.loads(data.decode('utf-8')), fingerprint(data)


def _main(argv):
    """Census: print the fingerprint distribution of the given globs."""
    import collections
    import sys
    if not argv:
        print(__doc__)
        return 0
    counts = collections.Counter()
    examples = collections.defaultdict(list)
    root = pathlib.Path('.')
    for pattern in argv:
        for p in sorted(root.glob(pattern)):
            fp = fingerprint(p.read_bytes())
            counts[fp] += 1
            if len(examples[fp]) < 3:
                examples[fp].append(p.name)
    for fp, n in counts.most_common():
        label = 'UNREPRODUCIBLE' if fp is None else \
            'ensure_ascii=%-5s indent=%-4r compact=%-5s nl=%s' % fp
        print(f'{n:6d}  {label}   e.g. {", ".join(examples[fp])}')
    print(f'{sum(counts.values()):6d}  TOTAL '
          f'({counts[None]} unreproducible)')
    return 1 if counts[None] else 0


if __name__ == '__main__':
    import sys
    raise SystemExit(_main(sys.argv[1:]))
