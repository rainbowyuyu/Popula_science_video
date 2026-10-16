"""Rainbow R/fish contours adapted from the user's original logo.svg.

The outer outline, head, tail and eye stay recognizable; a play aperture and
single AI spark add the editor's meaning. All coordinates share a 128px grid.
"""
from __future__ import annotations
import re

OUTLINE = 'M 134 15 C 280 3 346 58 360 141 C 371 205 330 242 295 268 L 378 417 L 169 417 C 150 416 139 412 138 411 C 111 401 67 375 50 310 C 26 215 56 154 98 120 L 98 68 Z'
HEAD = 'M 98 120 C 108 112 123 106 134 103 C 170 95 211 99 240 124 C 253 134 264 149 270 171 C 256 210 214 254 145 251 C 143 292 145 375 163 381 C 189 390 235 383 241 315 C 240 355 253 410 291 417'
UPPER = 'M 134 15 L 134 103 M 205 105 L 205 71 C 235 70 255 82 270 103 C 283 126 281 150 270 171'
PLAY = 'M 109 182 Q 109 177 114 180 L 169 211 Q 175 214 169 217 L 114 249 Q 109 252 109 246 Z'
SPARK = 'M 103 21.65 C 104.7 27.6 106.4 29.3 112.35 31 C 106.4 32.7 104.7 34.4 103 40.35 C 101.3 34.4 99.6 32.7 93.65 31 C 99.6 29.3 101.3 27.6 103 21.65 Z'
EYE = (232, 167, 11.3)
TRANSFORM = (.216, 17, 17)


def contours(path):
    """Flatten our small explicit SVG path vocabulary for matching PNG assets."""
    tokens = re.findall(r'[MLCQHVZ]|-?\d+(?:\.\d+)?', path)
    result, points, at, start, i = [], [], (0., 0.), None, 0
    while i < len(tokens):
        op = tokens[i]; i += 1
        if op == 'M':
            if points: result.append(points)
            at = (float(tokens[i]), float(tokens[i+1])); i += 2
            start = at; points = [at]
        elif op == 'L':
            at = (float(tokens[i]), float(tokens[i+1])); i += 2; points.append(at)
        elif op in ('H', 'V'):
            n = float(tokens[i]); i += 1
            at = (n, at[1]) if op == 'H' else (at[0], n); points.append(at)
        elif op in ('Q', 'C'):
            count = 4 if op == 'Q' else 6
            values = [float(t) for t in tokens[i:i+count]]; i += count
            control = list(zip(values[::2], values[1::2])); origin = at
            for step in range(1, 65):
                t = step / 64; u = 1-t
                if op == 'Q': point = tuple(u*u*origin[k]+2*u*t*control[0][k]+t*t*control[1][k] for k in (0,1))
                else: point = tuple(u**3*origin[k]+3*u*u*t*control[0][k]+3*u*t*t*control[1][k]+t**3*control[2][k] for k in (0,1))
                points.append(point)
            at = control[-1]
        elif op == 'Z':
            points.append(start); at = start
        else: raise ValueError(op)
    if points: result.append(points)
    return result
