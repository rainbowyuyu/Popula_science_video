# rainbow_yu — CS2 C4：1 秒成片特点预览（多样化）
"""覆盖：欧氏穿墙 / BFS绕墙 / 烘焙查表 / 扣血 / 公式白字 / 起终点。

Usage:
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotEuclidRingScene
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotBfsWavefrontScene
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotBakedLookupScene
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotHpPreviewFormulaScene
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotFgHGlyphScene
    python -m manim -qh --disable_caching video_project/cs2_c4/manim/showcase_clips.py ShotStartGoalScene
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from manim import *

_DIR = Path(__file__).resolve().parent
if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

import algo_code as ac  # noqa: E402
from yty_manim.basic_unit.cs2_arena import (  # noqa: E402
    BOMB_IJ,
    C_FLOOR,
    C_PATH,
    C_SUB,
    C_VIS_COOL,
    GRID,
    GridMap2D,
    SURVIVOR_IJ,
    UI_FONT,
    _heat_color,
    _neighbors4,
)

__all__ = (
    "ShotEuclidRingScene",
    "ShotBfsWavefrontScene",
    "ShotBakedLookupScene",
    "ShotHpPreviewFormulaScene",
    "ShotFgHGlyphScene",
    "ShotStartGoalScene",
    "ShotQueueChipEnqueueScene",
    "ShotSearchedWashScene",
    "ShotHeapPopFScene",
    "ShotCodeHighlightSlideScene",
)

BG = "#07090f"
BUDGET = 1.0


def _tag(text: str, color: str) -> Text:
    t = Text(text, font=UI_FONT, font_size=18, color=ManimColor(color), weight=BOLD)
    t.set_fill(ManimColor(color), opacity=1)
    t.set_stroke(width=0, opacity=0)
    return t


def _bundle(height: float = 3.6):
    grid_map = GridMap2D(BOMB_IJ, SURVIVOR_IJ)
    grid_map.markers.set_z_index(40)
    bundle = VGroup(grid_map, grid_map.markers)
    bundle.set_height(height)
    grid_map.sync_markers_to_tiles()
    return grid_map, bundle


class ShotEuclidRingScene(Scene):
    """欧氏距离热力：穿墙染色环。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        start = BOMB_IJ
        grid_map, bundle = _bundle(3.8)
        tag = _tag("冲击波 · 欧氏穿墙", "#fb7185")
        tag.next_to(bundle, UP, buff=0.14)

        cells = []
        for (i, j), tile in grid_map.tiles.items():
            d = float(np.hypot(i - start[0], j - start[1]))
            cells.append((d, i, j, tile))
        cells.sort(key=lambda x: x[0])
        max_d = max((c[0] for c in cells), default=1.0) or 1.0

        self.add(bundle, tag, grid_map.markers)
        self.bring_to_front(grid_map.markers)

        anims = []
        for d, i, j, tile in cells:
            if (i, j) in (BOMB_IJ, SURVIVOR_IJ):
                continue
            t = 1.0 - d / max_d
            col = _heat_color(0.25 + 0.75 * t)
            tile.set_fill(col, opacity=1)  # 先钉色，避免 animate 丢最终态
            anims.append(tile.animate.set_fill(col, opacity=1))
        # 重置为地板再播动画，保证过程可见
        for d, i, j, tile in cells:
            if (i, j) in (BOMB_IJ, SURVIVOR_IJ):
                continue
            tile.set_fill(ManimColor(C_FLOOR), opacity=1)
        self.play(LaggedStart(*anims, lag_ratio=0.012), run_time=BUDGET, rate_func=linear)
        for d, i, j, tile in cells:
            if (i, j) in (BOMB_IJ, SURVIVOR_IJ):
                continue
            t = 1.0 - d / max_d
            tile.set_fill(_heat_color(0.25 + 0.75 * t), opacity=1)
        self.bring_to_front(grid_map.markers)


class ShotBfsWavefrontScene(Scene):
    """BFS 按层热力上色 + 路径（LaggedStart 保证格子变色）。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        start, goal = BOMB_IJ, SURVIVOR_IJ
        grid_map, bundle = _bundle(3.5)
        tag = _tag("路径波 · 绕墙 BFS", C_VIS_COOL)
        tag.next_to(bundle, UP, buff=0.12)

        q = deque([start])
        dist = {start: 0}
        parent = {start: None}
        order = []
        while q:
            u = q.popleft()
            if u == goal:
                break
            for ni, nj, _ in _neighbors4(*u):
                v = (ni, nj)
                if v in dist or not GRID[ni, nj]:
                    continue
                dist[v] = dist[u] + 1
                parent[v] = u
                q.append(v)
                order.append(v)

        max_g = max(dist.values()) or 1
        self.add(bundle, tag, grid_map.markers)
        self.bring_to_front(grid_map.markers)

        discover = []
        final_cols = {}
        for v in order:
            if v not in grid_map.tiles or v in (start, goal):
                continue
            t = 1.0 - dist[v] / max_g
            col = _heat_color(0.2 + 0.8 * t)
            final_cols[v] = col
            discover.append(grid_map.tiles[v].animate.set_fill(col, opacity=1))
        self.play(LaggedStart(*discover, lag_ratio=0.018), run_time=0.72, rate_func=linear)
        # 钉死最终填色（防止极短动画丢色）
        for v, col in final_cols.items():
            grid_map.tiles[v].set_fill(col, opacity=1)

        path = ac._reconstruct(parent, goal)
        if path:
            self.play(Create(ac._path_on_map(grid_map, path, C_PATH)), run_time=0.28, rate_func=smooth)
        self.bring_to_front(grid_map.markers)


class ShotBakedLookupScene(Scene):
    """预烘焙热力表 + 探针闪格 + O(1)。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        tag = _tag("预烘焙 · O(1) 查表", "#3de0c8")
        badge = Text("O(1)", font="Consolas", font_size=28, color="#5eead4", weight=BOLD)
        badge.set_fill("#5eead4", opacity=1)

        rows, cols = 4, 5
        cells = VGroup()
        target_colors = []
        for r in range(rows):
            for c in range(cols):
                t = 1.0 - ((r - 0.8) ** 2 + (c - 1.2) ** 2) ** 0.5 / 4.5
                col = _heat_color(float(np.clip(0.2 + 0.75 * t, 0, 1)))
                sq = Square(
                    side_length=0.55, stroke_width=1.2, stroke_color="#3a4a60",
                    fill_color=ManimColor(C_FLOOR), fill_opacity=1,
                )
                sq.move_to(np.array([c * 0.62, -r * 0.62, 0]))
                cells.add(sq)
                target_colors.append(col)
        box = SurroundingRectangle(cells, color="#2a3a55", buff=0.12, stroke_width=1.5)
        title = Text("baked_field[site]", font="Consolas", font_size=16, color=C_SUB)
        title.set_fill(C_SUB, opacity=1)
        title.next_to(VGroup(box, cells), UP, buff=0.1)
        table = VGroup(title, box, cells)

        idx = 7
        probe = Dot(radius=0.1, color=YELLOW).move_to(cells[0].get_center())
        flash = SurroundingRectangle(
            cells[idx], color=YELLOW, buff=0.05, stroke_width=3.2, fill_opacity=0,
        )

        layout = VGroup(table, badge).arrange(RIGHT, buff=0.45).move_to(ORIGIN)
        tag.next_to(layout, UP, buff=0.22)
        self.add(tag, layout, probe)

        anims = [
            c.animate.set_fill(col, opacity=1)
            for c, col in zip(cells, target_colors)
        ]
        self.play(
            LaggedStart(*anims, lag_ratio=0.04),
            probe.animate.move_to(cells[idx].get_center()),
            run_time=0.7,
            rate_func=smooth,
        )
        self.play(Create(flash), Indicate(badge, color="#5eead4", scale_factor=1.15), run_time=0.3)


class ShotHpPreviewFormulaScene(Scene):
    """查表 power → 血条缩短。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        accent, hot = "#3de0c8", "#fb7185"
        tag = _tag("运行时 · 扣血预览", accent)
        hp_max, power, preview = 84, 31, 53

        rec_card = ac._rec_chip(power, 0.42)
        rec_frame = RoundedRectangle(
            width=4.2, height=0.8, corner_radius=0.1,
            fill_color="#0d1420", fill_opacity=1, stroke_color="#2a3a55", stroke_width=1.2,
        )
        rec_card.move_to(rec_frame.get_center())
        rec_title = Text("baked_field[site][cell]", font=UI_FONT, font_size=14, color=C_SUB)
        rec_title.set_fill(C_SUB, opacity=1)
        rec_title.next_to(rec_frame, UP, buff=0.06).align_to(rec_frame, LEFT)
        rec = VGroup(rec_title, rec_frame, rec_card)

        track = RoundedRectangle(
            width=3.8, height=0.36, corner_radius=0.09,
            fill_color="#1a2230", fill_opacity=1, stroke_color="#3a4a60", stroke_width=1.3,
        )
        fill = RoundedRectangle(
            width=3.5, height=0.24, corner_radius=0.06,
            fill_color="#3dd68c", fill_opacity=1, stroke_width=0,
        )
        fill.move_to(track.get_center()).align_to(track, LEFT).shift(RIGHT * 0.08)
        hp_lab = Text(f"HP  {hp_max}/{hp_max}", font="Consolas", font_size=18, color=WHITE, weight=BOLD)
        hp_lab.set_fill(WHITE, opacity=1)
        hp_lab.next_to(track, UP, buff=0.08)
        panel = VGroup(track, fill, hp_lab)

        layout = VGroup(rec, panel).arrange(DOWN, buff=0.35).move_to(ORIGIN)
        tag.next_to(layout, UP, buff=0.22)
        self.add(tag, layout)

        new_fill = RoundedRectangle(
            width=max(track.width - 0.16, 0.2) * preview / hp_max,
            height=fill.height, corner_radius=0.06,
            fill_color="#f87171", fill_opacity=1, stroke_width=0,
        )
        new_fill.move_to(track.get_center()).align_to(track, LEFT).shift(RIGHT * 0.08)
        new_lab = Text(f"HP  {preview}/{hp_max}", font="Consolas", font_size=18, color=WHITE, weight=BOLD)
        new_lab.set_fill(WHITE, opacity=1)
        new_lab.next_to(track, UP, buff=0.08)
        formula = Text(
            f"HP {hp_max} - {power} = {preview}",
            font="Consolas", font_size=22, color=hot, weight=BOLD,
        )
        formula.set_fill(hot, opacity=1)
        formula.next_to(panel, DOWN, buff=0.2)

        self.play(
            Transform(fill, new_fill),
            Transform(hp_lab, new_lab),
            FadeIn(formula, shift=UP * 0.05),
            run_time=0.85,
            rate_func=smooth,
        )
        self.wait(0.15)


class ShotFgHGlyphScene(Scene):
    """A* 公式卡：强制白字。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        tag = _tag("A* 代价公式", "#a78bfa")

        parts = []
        for ch in ("f", "=", "g", "+", "h"):
            t = Text(ch, font="Consolas", font_size=40, color=WHITE, weight=BOLD)
            t.set_fill(WHITE, opacity=1)
            t.set_stroke(width=0, opacity=0)
            parts.append(t)
        row = VGroup(*parts).arrange(RIGHT, buff=0.16)

        tip = Text("格内只标 f · 堆里看 g / h", font=UI_FONT, font_size=16, color=WHITE)
        tip.set_fill(WHITE, opacity=1)
        tip.set_stroke(width=0, opacity=0)

        bg = RoundedRectangle(
            width=row.width + 0.7, height=row.height + 0.5,
            corner_radius=0.14,
            fill_color="#0d1420", fill_opacity=1,
            stroke_color="#a78bfa", stroke_width=2.4,
        )
        row.move_to(bg.get_center())
        card = VGroup(bg, row)
        tag.next_to(card, UP, buff=0.28)
        tip.next_to(card, DOWN, buff=0.22)

        for t in parts:
            t.set_fill(WHITE, opacity=0)
        tip.set_fill(WHITE, opacity=0)
        self.add(tag, card, tip)
        self.play(
            *[t.animate.set_fill(WHITE, opacity=1) for t in parts],
            tip.animate.set_fill(WHITE, opacity=1),
            run_time=0.85,
            rate_func=smooth,
        )
        for t in parts:
            t.set_color(WHITE).set_fill(WHITE, opacity=1)
        tip.set_color(WHITE).set_fill(WHITE, opacity=1)
        self.wait(0.15)


class ShotStartGoalScene(Scene):
    """起终点标记 + 路径一笔。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        start, goal = BOMB_IJ, SURVIVOR_IJ
        grid_map, bundle = _bundle(3.8)
        tag = _tag("竞技场 · 起终点", "#fbbf24")
        tag.next_to(bundle, UP, buff=0.14)

        markers = grid_map.markers
        # 先只放地图，标记用 FadeIn（避免整组 set_opacity 染黑标签字）
        self.add(grid_map, tag)

        q = deque([start])
        parent = {start: None}
        found = False
        while q and not found:
            u = q.popleft()
            for ni, nj, _ in _neighbors4(*u):
                v = (ni, nj)
                if v in parent or not GRID[ni, nj]:
                    continue
                parent[v] = u
                if v == goal:
                    found = True
                    break
                q.append(v)
        path = ac._reconstruct(parent, goal)
        path_mob = ac._path_on_map(grid_map, path, C_PATH) if path else VGroup()

        self.play(
            FadeIn(markers),
            Create(path_mob),
            run_time=BUDGET,
            rate_func=smooth,
        )
        self.bring_to_front(markers)


# 旧名兼容
class ShotQueueChipEnqueueScene(ShotEuclidRingScene):
    pass


class ShotSearchedWashScene(ShotBfsWavefrontScene):
    pass


class ShotHeapPopFScene(ShotBakedLookupScene):
    pass


class ShotCodeHighlightSlideScene(ShotStartGoalScene):
    pass
