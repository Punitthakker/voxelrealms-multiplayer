#!/usr/bin/env python3
"""Assemble playforge.html from src/.

Layout of src/:
  00-head.html        title, meta, font link
  *.css               concatenated into one <style>, in file-name order
  *.svg               <symbol> elements, concatenated into the icon sprite
  30-markup.html      base screens and sheets; other *.html files are appended after it
  *.js                concatenated into one <script>, in file-name order (99-boot.js last)

Usage: build.py [--out FILE] [--three URL] [--skip NAME ...] [--extra DIR ...]
  --extra DIR adds the files in DIR (a file with the same name as one in src/ replaces it).
"""
import argparse, glob, os

HERE = os.path.dirname(os.path.abspath(__file__))
THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, 'playforge.html'))
    ap.add_argument('--src', default=os.path.join(HERE, 'src'))
    ap.add_argument('--three', default=THREE, help='three.js URL (tests point this at a local copy)')
    ap.add_argument('--skip', nargs='*', default=[], help='source files to leave out')
    ap.add_argument('--extra', nargs='*', default=[], help='extra source folders; same-named files replace src/ files')
    a = ap.parse_args()
    where = {f: a.src for f in os.listdir(a.src)}
    for d in a.extra:
        for f in os.listdir(d):
            if f.endswith(('.html', '.css', '.svg', '.js')): where[f] = d
    files = sorted(f for f in where if f not in a.skip and not f.startswith('.'))
    read = lambda f: open(os.path.join(where[f], f), encoding='utf-8').read().rstrip('\n') + '\n'
    css = ''.join(read(f) for f in files if f.endswith('.css'))
    svg = ''.join(read(f) for f in files if f.endswith('.svg'))
    html = [f for f in files if f.endswith('.html') and f != '00-head.html']
    html.sort(key=lambda f: (f != '30-markup.html', f))
    js = ''.join(read(f) for f in files if f.endswith('.js'))
    out = (read('00-head.html') + '<style>\n' + css + '</style>\n\n'
           + '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n  <defs>\n' + svg + '  </defs>\n</svg>\n\n'
           + ''.join(read(f) + '\n' for f in html)
           + f'<script src="{a.three}"></script>\n<script>\n' + js + '</script>\n')
    open(a.out, 'w', encoding='utf-8').write(out)
    print(f'wrote {a.out} ({len(out):,} bytes, {len(files)} source files)')

if __name__ == '__main__':
    main()
