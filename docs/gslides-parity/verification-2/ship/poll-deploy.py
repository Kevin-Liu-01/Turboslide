#!/usr/bin/env python3
"""The ship step's deployment poll (docs/gslides-parity/MILESTONES-2.md "Ship step").

    python3 docs/gslides-parity/verification-2/ship/poll-deploy.py [base] [minutes]

Every 30 s: GET base/ (the 307 to /new), base/new and base/edit/gt-brand (the SSR shells),
collect the stylesheets and module scripts each shell links, fetch them, and count the bytes of
the round two chrome's class markers in them: `ts-ruler` (Rulers.css) and `ts-deck-guide`
(DeckGuides.css), neither of which the round one deploy served (its assets count 0 for both;
`handle.` is counted too but is not a stop rule, the round one bundle carries it 23 times).
Stops when a class marker count is above zero on /new, or after the minutes given (default 15). Prints one line per poll and a final summary; exit 0 when the new chrome answered.
"""
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://turboslide.vercel.app').rstrip('/')
MINUTES = float(sys.argv[2]) if len(sys.argv) > 2 else 15
MARKERS = ['ts-ruler', 'ts-deck-guide', 'handle.']


def fetch(url, follow=False):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={'User-Agent': 'turboslide-ship-poll'})
    try:
        with opener.open(req, timeout=30) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


def assets_of(html):
    hrefs = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    hrefs += re.findall(r'<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"', html)
    srcs = re.findall(r'<script[^>]+src="([^"]+)"', html)
    return sorted(set(hrefs)), sorted(set(srcs))


def count_markers(base, paths):
    counts = {m: 0 for m in MARKERS}
    fetched = 0
    for path in paths:
        url = path if path.startswith('http') else base + path
        status, _, body = fetch(url, follow=True)
        if status != 200:
            continue
        fetched += 1
        text = body.decode('utf-8', 'replace')
        for m in MARKERS:
            counts[m] += text.count(m)
    return fetched, counts


deadline = time.time() + MINUTES * 60
poll = 0
while True:
    poll += 1
    now = datetime.now().strftime('%H:%M:%S')
    root_status, root_headers, _ = fetch(BASE + '/')
    location = root_headers.get('Location') or root_headers.get('location')
    lines = [f'{now} poll {poll}: / {root_status} -> {location}']
    hit = False
    for path in ['/new', '/edit/gt-brand']:
        status, headers, body = fetch(BASE + path)
        html = body.decode('utf-8', 'replace')
        sheets, scripts = assets_of(html)
        fetched, counts = count_markers(BASE, sheets + scripts)
        deploy = headers.get('x-vercel-id') or headers.get('X-Vercel-Id') or ''
        lines.append(
            f'  {path} {status} {len(body)} B; {len(sheets)} stylesheet(s), {len(scripts)} script(s), '
            f'{fetched} fetched; markers ' + ', '.join(f'{m} {n}' for m, n in counts.items())
            + (f'; x-vercel-id {deploy}' if deploy else '')
        )
        if path == '/new' and (counts['ts-ruler'] > 0 or counts['ts-deck-guide'] > 0):
            hit = True
    print('\n'.join(lines), flush=True)
    if hit:
        print(f'{now}: the round two chrome answers on /new after {poll} poll(s)')
        sys.exit(0)
    if time.time() >= deadline:
        print(f'{now}: no marker after {MINUTES} minutes')
        sys.exit(1)
    time.sleep(30)
