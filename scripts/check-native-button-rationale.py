#!/usr/bin/env python3
"""Per-SITE rationale check for the native <button>s left in src/**.vue.

system_3 #4513 (#4246-C8). The check this replaces was per-FILE —
`grep -ciE 'held|hold|not AspButton|stays native' <file>` — and on
origin/main @ 15123e2 it returned non-zero for all ten files that still hold a
native <button>, i.e. it reported the census closed. Nine of those natives had
no rationale anywhere near them; what the grep had matched was a note about a
DIFFERENT control elsewhere in the same file. A grep over 1860 lines cannot
tell "this control is held" from "this file once discussed a control".

So this walks each <button> site and asks whether a reader standing at THAT tag
would find a reason. A site is sited when either:

  (a) a rationale word appears in the text attached to the tag — the 12 lines
      above it, extended to take in the whole of an HTML comment that ends
      just above it, however long that comment runs. Extending matters: a
      rationale worth writing is longer than twelve lines, and a fixed window
      would quietly start rewarding short comments over good ones; or

  (b) the site belongs to a contiguous run of natives — only sibling markup
      between it and the one before — whose first member is sited. One comment
      over a v-for, or over a four-row menu, covers the group it heads.

Site detection skips anything inside an HTML comment, and that exclusion is
load-bearing rather than tidiness. A rationale explaining why a control stays
native naturally quotes the tag it is about ("attrs fall through to its root
<button>"), and a line-anchored match counts that prose as a site. It then
finds the surrounding comment attached to it and reports it SITED — so the
miscount lands in the passing column and never shows up as a failure. The
first draft of this script did exactly that: a comment-only edit moved the
total from 13 to 14 while still exiting 0. A pattern match over source is not
a count until it excludes comment context.

Usage:
    scripts/check-native-button-rationale.py                      # working tree
    scripts/check-native-button-rationale.py --ref origin/main    # any commit
    scripts/check-native-button-rationale.py --skip src/views/x.vue,src/y.vue

Exits non-zero and names every unsited site.

Counts, so a later reader can tell a regression from the known backlog
(measured 2026-08-28, `--ref origin/main` @ 15123e2 and the #4513 branch):

    origin/main   4 sited / 23 unsited   (9 in the three files #4513 closes,
                                          12 GameTimeline, 2 JobsView)
    #4513 branch  12 sited /  0 unsited  in scope, i.e. with GameTimeline and
                                         JobsView skipped

Still unsited repo-wide after this branch, both out of its scope because each
sits in another open PR's file set: GameTimeline.vue (12, closed by PR #243 /
#4512) and JobsView.vue:154,163 (a 2-option tab strip — the AspSegmented
question of #4450, see #4246).
"""
import argparse
import pathlib
import re
import subprocess
import sys

RATIONALE = re.compile(r'held|hold|stays native|not AspButton|deliberate', re.I)
OPEN_TAG = re.compile(r'^\s*<button')
CLOSE_TAG = re.compile(r'</button>|/>')
WINDOW = 12


def attached_text(lines, i):
    """The rationale text a reader would see attached to the tag at index i."""
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


def comment_mask(lines):
    """True for each line whose START sits inside an HTML comment."""
    mask, inside = [], False
    for line in lines:
        mask.append(inside)
        i = 0
        while True:
            if inside:
                j = line.find('-->', i)
                if j < 0:
                    break
                inside, i = False, j + 3
            else:
                j = line.find('<!--', i)
                if j < 0:
                    break
                inside, i = True, j + 4
    return mask


def sources(ref):
    """(path, lines) for every src/**.vue, from `ref` or from the working tree."""
    if ref is None:
        for p in sorted(pathlib.Path('src').rglob('*.vue')):
            yield str(p), p.read_text(encoding='utf-8').splitlines()
        return
    listing = subprocess.run(
        ['git', 'ls-tree', '-r', '--name-only', ref, 'src'],
        capture_output=True, text=True, check=True,
    )
    for path in sorted(p for p in listing.stdout.splitlines() if p.endswith('.vue')):
        blob = subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, text=True, check=True)
        yield path, blob.stdout.splitlines()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ref', help='git ref to read instead of the working tree')
    ap.add_argument('--skip', default='', help='comma-separated paths to exclude')
    args = ap.parse_args()
    skip = {s for s in args.skip.split(',') if s}

    sited = unsited = 0
    for path, lines in sources(args.ref):
        if path in skip:
            continue
        prev_end, prev_sited = None, False
        in_comment = comment_mask(lines)
        for i, line in enumerate(lines):
            if not OPEN_TAG.match(line) or in_comment[i]:
                continue
            ok = bool(RATIONALE.search(attached_text(lines, i)))
            if not ok and prev_sited and prev_end is not None:
                between = '\n'.join(lines[prev_end:i]).strip()
                ok = not between or between.startswith('<')
            if ok:
                sited += 1
            else:
                unsited += 1
                print(f'UNSITED {path}:{i + 1}  {line.strip()[:70]}')
            j = i
            while j < len(lines) and not CLOSE_TAG.search(lines[j]):
                j += 1
            prev_end, prev_sited = j + 1, ok

    print(f'\nsited: {sited}   unsited: {unsited}')
    return 1 if unsited else 0


if __name__ == '__main__':
    sys.exit(main())
