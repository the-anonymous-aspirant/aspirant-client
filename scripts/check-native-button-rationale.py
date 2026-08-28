#!/usr/bin/env python3
"""Per-SITE native-<button> rationale check (#4513).

The #4512 acceptance check was per-FILE: `grep -ciE 'held|hold|...' <file>`.
It false-passes whenever a file holds a native and ALSO happens to discuss a
DIFFERENT control somewhere in its 1800 lines — true for 3 of the 8 files on
origin/main @ 15123e2. This walks each native <button> site instead and asks
whether a rationale is sited at THAT control.

Sited means one of:
  (a) a rationale word appears in the comment block attached to the tag —
      the contiguous run of comment lines immediately above it, however long,
      plus a 12-line floor so a short note with a blank line still counts; or
  (b) the site is part of a contiguous run of natives (only sibling markup
      between it and the previous one) whose first member is sited — one
      comment over a v-for or a four-row menu covers the group it heads.

A fixed-size window alone is not enough: a rationale worth writing runs longer
than 12 lines, and cutting it in half is how the check would start demanding
short comments instead of good ones.
"""
import re, subprocess, sys, pathlib

WORDS = re.compile(r'held|hold|stays native|not AspButton|deliberate', re.I)
TAG = re.compile(r'^\s*<button')
CLOSE = re.compile(r'</button>|/>')
WINDOW = 12

def attached_block(lines, i):
    """The rationale text a reader would see attached to the tag at index i.

    That is the 12 lines above it, plus — if the nearest non-blank line above
    closes an HTML comment — the whole of that comment, however long. A fixed
    window alone would cut a long comment in half, which is how the check would
    end up demanding SHORT rationales instead of good ones.
    """
    top = max(0, i - WINDOW)
    j = i - 1
    while j >= 0 and not lines[j].strip():
        j -= 1
    if j >= 0 and lines[j].rstrip().endswith('-->'):
        k = j
        while k >= 0 and '<!--' not in lines[k]:
            k -= 1
        if k >= 0:
            top = min(top, k)
    return '\n'.join(lines[top:i])


ref = sys.argv[1] if len(sys.argv) > 1 else None
skip = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else set()

bad = ok = 0
for f in sorted(p for p in pathlib.Path('src').rglob('*.vue')):
    if str(f) in skip:
        continue
    if ref:
        r = subprocess.run(['git', 'show', f'{ref}:{f}'], capture_output=True, text=True)
        if r.returncode:
            continue
        lines = r.stdout.splitlines()
    else:
        lines = f.read_text(encoding='utf-8').splitlines()

    prev_end = None      # line index just after the previous native closed
    prev_sited = False
    for i, ln in enumerate(lines):
        if not TAG.match(ln):
            continue
        sited = bool(WORDS.search(attached_block(lines, i)))
        if not sited and prev_sited and prev_end is not None:
            # (b): nothing but sibling markup since the last sited native?
            between = '\n'.join(lines[prev_end:i]).strip()
            if not between or between.startswith('<'):
                sited = True
        if sited:
            ok += 1
        else:
            bad += 1
            print(f'UNSITED {f}:{i+1}  {ln.strip()[:70]}')
        # walk to this tag's close
        j = i
        while j < len(lines) and not CLOSE.search(lines[j]):
            j += 1
        prev_end, prev_sited = j + 1, sited

print(f'\nsited: {ok}   unsited: {bad}')
sys.exit(1 if bad else 0)
