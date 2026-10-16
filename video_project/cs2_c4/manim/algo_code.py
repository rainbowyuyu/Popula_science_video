# rainbow_yu — CS2 C4 成片：算法实际代码演示（CodeStep）
"""BFS / A* / 预烘焙 O(1) 查表 — 代码步进 + 地图联动。

Usage:
    python -m manim -qh video_project/cs2_c4/manim/algo_code.py BFSCodeDemoScene
    python -m manim -qh video_project/cs2_c4/manim/algo_code.py AStarCodeDemoScene
    python -m manim -qh video_project/cs2_c4/manim/algo_code.py PrebakeLookupCodeDemoScene
"""

from __future__ import annotations

from collections import deque
import heapq

import numpy as np
from manim import *

from yty_manim.basic_unit.code_step import CodeStep
from yty_manim.basic_unit.cs2_arena import (
    BOMB_IJ,
    C_FLOOR,
    C_GOAL,
    C_PATH,
    C_SUB,
    C_TITLE,
    C_VIS_COOL,
    C_VIS_HOT,
    C_VIS_MID,
    GRID,
    GridMap2D,
    SURVIVOR_IJ,
    UI_FONT,
    Z_MARKERS,
    Z_METRICS,
    Z_PATH,
    _neighbors4,
    _neighbors8,
)
from yty_manim.disposition.speed_rate_fuc import ease_in_out_cubic, ease_out_cubic

__all__ = (
    "BFSCodeDemoScene",
    "AStarCodeDemoScene",
    "PrebakeLookupCodeDemoScene",
)

BG = "#07090f"
CODE_BG = {
    "fill_color": "#0c121c",
    "stroke_color": "#2a3a55",
    "stroke_width": 1.5,
    "buff": 0.16,
}

LEFT_MAX_W = 5.35
RIGHT_MAX_W = 7.2
COL_GAP = 0.45
FRAME_RIGHT = 6.85
FRAME_LEFT = -6.85
CAP_Y = -3.28

C_G = "#5eead4"
C_H = "#c4b5fd"
C_F = "#fde68a"
C_P = "#fca5a5"
C_A = "#93c5fd"
# 已扫过描边：亮青描边 = 波前扫过的痕迹
C_SEARCHED_STROKE = "#5eead4"

BFS_CODE = """\
def bfs(grid, start, goal):
    q = deque([start])
    dist = {start: 0}
    parent = {start: None}
    while q:
        u = q.popleft()
        if u == goal:
            break
        for v, _w in neighbors4(u):
            if v in dist or not grid[v]:
                continue
            dist[v] = dist[u] + 1
            parent[v] = u
            q.append(v)
    return reconstruct(parent, goal)
"""

ASTAR_CODE = """\
def astar(grid, start, goal):
    def h(n):
        return hypot(n[0] - goal[0], n[1] - goal[1])
    g = {start: 0.0}
    parent = {start: None}
    open_pq = [(h(start), 0.0, start)]
    closed = set()
    while open_pq:
        f, g_u, u = heappop(open_pq)
        if u in closed:
            continue
        closed.add(u)
        if u == goal:
            break
        for v, w in neighbors8(u):
            if v in closed or not grid[v]:
                continue
            g_v = g_u + w
            if g_v < g.get(v, inf):
                g[v] = g_v
                parent[v] = u
                heappush(open_pq, (g_v + h(v), g_v, v))
    return reconstruct(parent, goal)
"""

LOOKUP_CODE = """\
# compile-time: bake once into vdata
for cell in walkable:
    dist[cell] = dijkstra_wave(site, cell)
    field[site][cell].arrival = dist[cell] / WAVE_SPEED
    field[site][cell].power = falloff(dist[cell])

# runtime: O(1) table lookup each tick
def apply_shockwave(player, t, site):
    wave_front = detonate_t + (t - t0) * WAVE_SPEED
    cell = world_to_cell(player.pos)
    rec = baked_field[site][cell]
    if wave_front >= rec.arrival:
        ApplyDamage(player, rec.power)
    preview_hp = player.hp - rec.power
"""


# ── 节奏 ────────────────────────────────────────────────────


def step_runtime(step: int, *, slow: float = 0.95, fast: float = 0.10, warm: int = 8) -> float:
    floor = max(fast, 1.0 / 15.0)
    if step <= 0:
        return slow
    if step < warm:
        t = step / max(warm, 1)
        return slow * (1.0 - 0.55 * t)
    return max(floor, slow * (0.72 ** (step - warm + 1)))


# ── 布局 ────────────────────────────────────────────────────


def _title_bar(main: str, sub: str, accent: str) -> VGroup:
    t = Text(main, font=UI_FONT, font_size=30, color=C_TITLE)
    s = Text(sub, font=UI_FONT, font_size=16, color=C_SUB)
    bar = VGroup(t, s).arrange(DOWN, aligned_edge=LEFT, buff=0.06)
    tip = Rectangle(
        width=0.11, height=bar.height,
        fill_color=accent, fill_opacity=1, stroke_width=0,
    )
    tip.next_to(bar, LEFT, buff=0.10)
    return VGroup(tip, bar).to_corner(UL, buff=0.24)


def _make_code(code: str) -> CodeStep:
    cs = CodeStep(
        code_string=code.strip("\n"),
        language="python",
        formatter_style="monokai",
        background="rectangle",
        background_config=dict(CODE_BG),
        add_line_numbers=True,
        paragraph_config={"font": "Consolas", "font_size": 18},
    )
    cs.prepare(hide=True)
    if cs.width > LEFT_MAX_W:
        cs.set_width(LEFT_MAX_W)
    return cs


def _bundle_map(start, goal) -> tuple[GridMap2D, VGroup]:
    grid_map = GridMap2D(start, goal)
    # 起终点标记始终压在格内数值之上
    grid_map.markers.set_z_index(max(Z_MARKERS, 40))
    return grid_map, VGroup(grid_map, grid_map.markers)


def _mark_searched(
    grid_map: GridMap2D,
    vars_layer: "CellVarLayer",
    cell,
    *,
    start,
    goal,
    animate: bool = True,
) -> list[Animation]:
    """已扩展完毕：数值消失；青蓝残影+亮描边，像波前扫过（起终点仅清数值）。"""
    anims: list[Animation] = []
    anims.extend(vars_layer.clear_cell(cell, animate=animate))
    if cell in (start, goal) or cell not in grid_map.tiles:
        return anims
    tile = grid_map.tiles[cell]
    # 地板渗入冷青，再叠一点原前沿色残影 → 明显「扫过」轨迹
    wash = interpolate_color(ManimColor(C_FLOOR), ManimColor(C_VIS_COOL), 0.68)
    fill = interpolate_color(wash, ManimColor(_cell_color(cell)), 0.28)
    stroke = ManimColor(C_SEARCHED_STROKE)
    if animate:
        anims.append(
            tile.animate.set_fill(fill, opacity=0.96).set_stroke(
                stroke, width=2.4, opacity=0.9,
            )
        )
    else:
        tile.set_fill(fill, opacity=0.96)
        tile.set_stroke(stroke, width=2.4, opacity=0.9)
    return anims


def _layout_demo(
    code: CodeStep,
    map_block: VGroup,
    struct: Mobject,
    title: Mobject,
    glossary: Mobject | None,
    grid_map: GridMap2D | None = None,
) -> None:
    """左代码 · 右上地图（可缩放）· 右下结构/图例保持可读字号不随地图压扁。"""
    if code.width > LEFT_MAX_W:
        code.set_width(LEFT_MAX_W)
    code.next_to(title, DOWN, buff=0.22)
    code.set_x(FRAME_LEFT + code.width / 2 + 0.12)
    if code.get_bottom()[1] < -2.2:
        code.scale(0.88)
        code.set_x(FRAME_LEFT + code.width / 2 + 0.12)
        code.next_to(title, DOWN, buff=0.18)

    split_x = code.get_right()[0] + COL_GAP
    avail_w = FRAME_RIGHT - split_x - 0.08
    max_map_w = min(RIGHT_MAX_W, avail_w)
    max_map_h = 3.55

    # 只缩放地图，避免队列/堆/图例文字被压糊
    if map_block.width > max_map_w:
        map_block.set_width(max_map_w)
    if map_block.height > max_map_h:
        map_block.set_height(max_map_h)

    map_block.next_to(code, RIGHT, buff=COL_GAP)
    map_block.align_to(code, UP)
    if map_block.get_left()[0] < split_x - 0.01:
        map_block.set_x(split_x + map_block.width / 2)
    if map_block.get_right()[0] > FRAME_RIGHT:
        map_block.set_width(FRAME_RIGHT - split_x - 0.08)
        map_block.set_x(split_x + map_block.width / 2)

    # 结构条/图例不缩放：缩字会糊；过宽时由组件自行减项或换行
    struct.next_to(map_block, DOWN, buff=0.16)
    struct.align_to(map_block, LEFT)
    if struct.get_right()[0] > FRAME_RIGHT:
        struct.align_to(map_block, LEFT)
        struct.shift(LEFT * max(0.0, struct.get_right()[0] - FRAME_RIGHT))

    bottom = struct
    if glossary is not None:
        glossary.next_to(struct, DOWN, buff=0.12)
        glossary.align_to(map_block, LEFT)
        if glossary.get_right()[0] > FRAME_RIGHT:
            glossary.shift(LEFT * max(0.0, glossary.get_right()[0] - FRAME_RIGHT))
        bottom = glossary

    if bottom.get_bottom()[1] < CAP_Y + 0.4:
        shift = CAP_Y + 0.4 - bottom.get_bottom()[1]
        map_block.shift(UP * shift)
        struct.shift(UP * shift)
        if glossary is not None:
            glossary.shift(UP * shift)

    if grid_map is not None:
        grid_map.sync_markers_to_tiles()
        grid_map.markers.set_z_index(max(Z_MARKERS, 40))


def _path_on_map(grid_map: GridMap2D, path: list, color: str) -> VMobject:
    pts = [grid_map.tiles[c].get_center() for c in path if c in grid_map.tiles]
    if len(pts) < 2:
        return VGroup()
    line = VMobject(stroke_color=color, stroke_width=5.0)
    line.set_points_as_corners(pts)
    dots = VGroup(*[Dot(p, radius=0.045, color=color) for p in pts])
    return VGroup(line, dots)


def _reconstruct(parent: dict, goal) -> list:
    path = []
    cur = goal if goal in parent else None
    while cur is not None:
        path.append(cur)
        cur = parent[cur]
    path.reverse()
    return path


class SoftCursor:
    """单例游标，跨格 Transform 滑动。"""

    def __init__(self):
        self.box: SurroundingRectangle | None = None

    def move_to(self, scene: Scene, grid_map: GridMap2D, cell, *, color=YELLOW, run_time: float = 0.25) -> None:
        if cell not in grid_map.tiles:
            return
        target = SurroundingRectangle(
            grid_map.tiles[cell],
            color=color, buff=0.025, stroke_width=3.0, fill_opacity=0,
        )
        target.set_z_index(Z_PATH)
        if self.box is None:
            self.box = target
            scene.play(Create(self.box), run_time=run_time, rate_func=smooth)
        else:
            scene.play(Transform(self.box, target), run_time=run_time, rate_func=smooth)

    def fade(self, scene: Scene, run_time: float = 0.15) -> None:
        if self.box is None:
            return
        scene.play(FadeOut(self.box), run_time=run_time)
        self.box = None


# ── 变量层 / 图例 ───────────────────────────────────────────


class CellVarLayer(VGroup):
    """格内数值：白色加粗、居中放大；层级低于起终点标记。"""

    def __init__(self, grid_map: GridMap2D, font_size: int = 16, **kwargs):
        super().__init__(**kwargs)
        self.grid_map = grid_map
        self.font_size = font_size
        self._blocks: dict[tuple[int, int], VGroup] = {}
        self.set_z_index(Z_METRICS)

    def clear_cell(self, cell, *, animate: bool = True) -> list[Animation]:
        old = self._blocks.pop(cell, None)
        if old is None:
            return []
        if animate:
            self.remove(old)
            return [FadeOut(old)]
        self.remove(old)
        return []

    def set_vars(
        self,
        cell,
        *,
        g: float | int | None = None,
        h: float | int | None = None,
        f: float | int | None = None,
        p: float | int | None = None,
        a: float | int | None = None,
        hot: bool = False,
        animate: bool = True,
    ) -> list[Animation]:
        if cell not in self.grid_map.tiles:
            return []
        lines: list[str] = []
        if g is not None:
            lines.append(f"g={g:.1f}" if isinstance(g, float) else f"g={g}")
        if h is not None:
            lines.append(f"h={h:.1f}" if isinstance(h, float) else f"h={h}")
        if f is not None:
            lines.append(f"f={f:.1f}" if isinstance(f, float) else f"f={f}")
        if p is not None:
            lines.append(f"p={int(p)}")
        if a is not None:
            lines.append(f"a={a:.2f}" if isinstance(a, float) else f"a={a}")
        if not lines:
            return []

        tile = self.grid_map.tiles[cell]
        col = YELLOW if hot else WHITE
        texts = VGroup(*[
            Text(s, font="Consolas", font_size=self.font_size, color=col, weight=BOLD)
            for s in lines
        ]).arrange(DOWN, buff=0.02)
        max_w = tile.width * 0.92
        max_h = tile.height * 0.88
        if texts.width > max_w:
            texts.set_width(max_w)
        if texts.height > max_h:
            texts.set_height(max_h)
        texts.move_to(tile.get_center())
        texts.set_z_index(Z_METRICS)

        old = self._blocks.get(cell)
        self._blocks[cell] = texts
        anims: list[Animation] = []
        if old is None:
            self.add(texts)
            if animate:
                anims.append(FadeIn(texts, scale=0.92))
        elif animate:
            anims.append(FadeOut(old))
            self.remove(old)
            self.add(texts)
            anims.append(FadeIn(texts))
        else:
            self.remove(old)
            self.add(texts)
        return anims


class VarGlossary(VGroup):
    """高对比图例：深底白字，绝不半透明压糊。"""

    def __init__(self, items: list[tuple[str, str, str]], **kwargs):
        super().__init__(**kwargs)
        chips = VGroup()
        self.chips: dict[str, VGroup] = {}
        for key, title, color in items:
            k = Text(key, font="Consolas", font_size=18, color=ManimColor(color), weight=BOLD)
            t = Text(title, font=UI_FONT, font_size=16, color=WHITE, weight=BOLD)
            row = VGroup(k, t).arrange(RIGHT, buff=0.12)
            bg = RoundedRectangle(
                width=row.width + 0.36,
                height=row.height + 0.22,
                corner_radius=0.1,
                fill_color="#111827",
                fill_opacity=1.0,
                stroke_color=ManimColor(color),
                stroke_width=2.4,
            )
            row.move_to(bg.get_center())
            chip = VGroup(bg, row)
            chips.add(chip)
            self.chips[key] = chip
        # 过宽则两行，避免 set_width 压糊
        if len(chips) <= 3:
            laid = chips.arrange(RIGHT, buff=0.14)
        else:
            row1 = VGroup(*list(chips[:2])).arrange(RIGHT, buff=0.14)
            row2 = VGroup(*list(chips[2:])).arrange(RIGHT, buff=0.14)
            laid = VGroup(row1, row2).arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        self.add(laid)

    def light(self, scene: Scene, key: str, run_time: float = 0.35) -> None:
        chip = self.chips.get(key)
        if chip is None:
            return
        scene.play(
            chip[0].animate.set_stroke(width=3.2),
            Indicate(chip, color=chip[0].get_stroke_color(), scale_factor=1.06),
            run_time=run_time,
        )


class BottomCaption:
    def __init__(self, scene: Scene):
        self.scene = scene
        self.mob: Mobject | None = None

    def show(self, text: str, *, color=GREY_A, run_time: float = 0.32) -> None:
        # 长句自动折成两行
        if len(text) > 28 and "：" in text:
            head, _, tail = text.partition("：")
            note = VGroup(
                Text(head + "：", font=UI_FONT, font_size=18, color=color),
                Text(tail, font=UI_FONT, font_size=18, color=GREY_B),
            ).arrange(DOWN, buff=0.04, aligned_edge=LEFT)
        elif len(text) > 32:
            mid = len(text) // 2
            cut = text.rfind("，", 0, mid + 6)
            if cut < 8:
                cut = text.rfind(" ", 0, mid + 6)
            if cut < 8:
                cut = mid
            note = VGroup(
                Text(text[:cut + 1].rstrip("，"), font=UI_FONT, font_size=18, color=color),
                Text(text[cut + 1:].lstrip("，"), font=UI_FONT, font_size=18, color=GREY_B),
            ).arrange(DOWN, buff=0.04, aligned_edge=LEFT)
        else:
            note = Text(text, font=UI_FONT, font_size=20, color=color)
        if note.width > 12.4:
            note.set_width(12.4)
        note.move_to([0, CAP_Y, 0])
        if self.mob is None:
            self.scene.play(FadeIn(note, shift=UP * 0.04), run_time=run_time)
        else:
            self.scene.play(FadeOut(self.mob), FadeIn(note, shift=UP * 0.04), run_time=run_time)
        self.mob = note

    def clear(self, run_time: float = 0.18) -> None:
        if self.mob is None:
            return
        self.scene.play(FadeOut(self.mob), run_time=run_time)
        self.mob = None


# ── 结构面板 ────────────────────────────────────────────────

_CELL_PALETTE = [
    "#2dd4bf", "#38bdf8", "#818cf8", "#a78bfa",
    "#e879f9", "#fb7185", "#fb923c", "#facc15",
]


def _cell_color(cell) -> str:
    """格子与队列/堆共用稳定配色，便于对照。"""
    i, j = int(cell[0]), int(cell[1])
    return _CELL_PALETTE[(i * 7 + j * 13) % len(_CELL_PALETTE)]


def _solid_chip(text: str, color, *, font_size: int = 15, text_color=WHITE, stroke_color=WHITE) -> VGroup:
    """实心色块 + 白字高对比。"""
    lab = Text(str(text), font="Consolas", font_size=font_size, color=text_color, weight=BOLD)
    bg = RoundedRectangle(
        width=max(lab.width + 0.28, 0.85),
        height=0.44,
        corner_radius=0.08,
        fill_color=ManimColor(color),
        fill_opacity=1.0,
        stroke_color=ManimColor(stroke_color),
        stroke_width=1.6,
        stroke_opacity=0.55,
    )
    lab.move_to(bg.get_center())
    return VGroup(bg, lab)


def _heap_chip(f: float, g: float, cell, *, font_size: int = 12) -> VGroup:
    """堆项整块颜色 = 对应格子颜色，白字标 f/g/坐标。"""
    color = _cell_color(cell)
    lab = VGroup(
        Text(f"f={f:.1f} g={g:.1f}", font="Consolas", font_size=font_size, color=WHITE, weight=BOLD),
        Text(f"{cell[0]},{cell[1]}", font="Consolas", font_size=font_size, color=WHITE, weight=BOLD),
    ).arrange(DOWN, buff=0.02)
    bg = RoundedRectangle(
        width=max(lab.width + 0.24, 1.05),
        height=max(lab.height + 0.16, 0.58),
        corner_radius=0.08,
        fill_color=ManimColor(color),
        fill_opacity=1.0,
        stroke_color=WHITE,
        stroke_width=1.4,
        stroke_opacity=0.45,
    )
    lab.move_to(bg.get_center())
    return VGroup(bg, lab)


def _queue_chip(cell, *, is_front: bool = False, font_size: int = 15) -> VGroup:
    color = _cell_color(cell)
    label = f"F:{cell[0]},{cell[1]}" if is_front else f"{cell[0]},{cell[1]}"
    # 队头加黄描边，填充色仍与格子一致
    return _solid_chip(
        label, color, font_size=font_size, text_color=WHITE,
        stroke_color=YELLOW if is_front else WHITE,
    )


def _rec_chip(power: int | None, arrival: float | None, *, font_size: int = 14) -> VGroup:
    if power is None:
        blk_p = _solid_chip("p=--", C_P, font_size=font_size, text_color=WHITE)
        blk_a = _solid_chip("a=--", C_A, font_size=font_size, text_color=WHITE)
    else:
        blk_p = _solid_chip(f"p={power}", C_P, font_size=font_size, text_color=WHITE)
        blk_a = _solid_chip(f"a={arrival:.2f}s", C_A, font_size=font_size, text_color=WHITE)
    return VGroup(blk_p, blk_a).arrange(RIGHT, buff=0.1)


class QueueStrip(VGroup):
    def __init__(self, title: str = "q  deque  front -> back", accent=C_VIS_COOL, **kwargs):
        super().__init__(**kwargs)
        self.accent = accent
        self.title = Text(title, font=UI_FONT, font_size=15, color=C_SUB)
        self.row = VGroup()
        self.frame = RoundedRectangle(
            width=6.5, height=0.88, corner_radius=0.1,
            fill_color="#0d1420", fill_opacity=1,
            stroke_color="#2a3a55", stroke_width=1.2,
        )
        self.row.move_to(self.frame.get_center())
        body = VGroup(self.frame, self.row)
        self.title.next_to(body, UP, buff=0.06).align_to(body, LEFT)
        self.add(self.title, body)
        self._items: list[VGroup] = []

    def _relayout(self) -> None:
        self.row.submobjects = []
        if not self._items:
            return
        # 过宽减项，不缩字
        while True:
            self.row.submobjects = []
            for m in self._items:
                self.row.add(m)
            vg = VGroup(*self._items).arrange(RIGHT, buff=0.1)
            if vg.width <= self.frame.width - 0.24 or len(self._items) <= 1:
                vg.move_to(self.frame.get_center())
                return
            self._items.pop()

    def sync_instant(self, cells: list) -> None:
        self.row.submobjects = []
        self._items = [
            _queue_chip(c, is_front=(i == 0), font_size=15)
            for i, c in enumerate(cells[:8])
        ]
        self._relayout()


class HeapStrip(VGroup):
    def __init__(self, title: str = "open_pq  min-heap  (f · g · cell)", accent="#a78bfa", **kwargs):
        super().__init__(**kwargs)
        self.accent = accent
        self.title = Text(title, font=UI_FONT, font_size=15, color=C_SUB)
        self.row = VGroup()
        self.frame = RoundedRectangle(
            width=6.7, height=1.15, corner_radius=0.1,
            fill_color="#0d1420", fill_opacity=1,
            stroke_color="#2a3a55", stroke_width=1.2,
        )
        self.row.move_to(self.frame.get_center())
        body = VGroup(self.frame, self.row)
        self.title.next_to(body, UP, buff=0.06).align_to(body, LEFT)
        self.add(self.title, body)
        self._items: list[VGroup] = []

    def _place_items(self) -> None:
        self.row.submobjects = []
        if not self._items:
            empty = Text("(empty)", font="Consolas", font_size=16, color=GREY_B)
            empty.move_to(self.frame.get_center())
            self.row.add(empty)
            self._items = [empty]
            return
        while True:
            self.row.submobjects = []
            for m in self._items:
                self.row.add(m)
            vg = VGroup(*self._items).arrange(RIGHT, buff=0.08)
            if vg.width <= self.frame.width - 0.2 or len(self._items) <= 1:
                vg.move_to(self.frame.get_center())
                return
            self._items.pop()

    def refresh(self, entries: list[tuple[float, float, tuple]]) -> None:
        """整表重建，禁止 FadeOut/set_opacity(0)，避免后续演示栈「消失」。"""
        self.row.submobjects = []
        ordered = sorted(entries, key=lambda e: (e[0], e[1]))
        # 同格只保留最优 f，最多展示 5 项
        best: dict[tuple, tuple[float, float, tuple]] = {}
        for f, g, c in ordered:
            prev = best.get(c)
            if prev is None or (f, g) < (prev[0], prev[1]):
                best[c] = (f, g, c)
        shown = sorted(best.values(), key=lambda e: (e[0], e[1]))[:5]
        self._items = [_heap_chip(f, g, c, font_size=12) for f, g, c in shown]
        self._place_items()

    def sync(self, entries: list[tuple[float, float, tuple]], *, animate: bool = True) -> list[Animation]:
        # 保留 API；不再返回 Fade 动画（animate 参数忽略）
        self.refresh(entries)
        return []

    def sync_instant(self, entries: list[tuple[float, float, tuple]]) -> None:
        self.refresh(entries)


class RecStrip(VGroup):
    def __init__(self, accent="#3de0c8", **kwargs):
        super().__init__(**kwargs)
        self.accent = accent
        self.title = Text("baked_field[site][cell]", font=UI_FONT, font_size=15, color=C_SUB)
        self.card = _rec_chip(None, None)
        self.frame = RoundedRectangle(
            width=4.6, height=0.86, corner_radius=0.1,
            fill_color="#0d1420", fill_opacity=1,
            stroke_color="#2a3a55", stroke_width=1.2,
        )
        self.card.move_to(self.frame.get_center())
        body = VGroup(self.frame, self.card)
        self.title.next_to(body, UP, buff=0.06).align_to(body, LEFT)
        self.add(self.title, body)

    def update_rec(self, scene: Scene, power: int, arrival: float, *, run_time: float = 0.3) -> None:
        new = _rec_chip(power, arrival)
        new.move_to(self.frame.get_center())
        scene.play(Transform(self.card, new), run_time=run_time, rate_func=smooth)


# ── BFS ─────────────────────────────────────────────────────


class BFSCodeDemoScene(Scene):
    def construct(self):
        self.camera.background_color = ManimColor(BG)
        start, goal = BOMB_IJ, SURVIVOR_IJ
        accent = C_VIS_COOL
        warm = 8

        title = _title_bar("BFS 实际代码", "变量 g · FIFO 队列 · 详尽讲解后加速", accent)
        badge = Text("O(|V|+|E|)", font="Consolas", font_size=18, color=accent).to_corner(UR, buff=0.3)
        self.play(FadeIn(title), FadeIn(badge), run_time=0.45, rate_func=ease_out_cubic)

        code = _make_code(BFS_CODE)
        grid_map, bundle = _bundle_map(start, goal)
        vars_layer = CellVarLayer(grid_map, font_size=18)
        map_block = bundle
        qstrip = QueueStrip(accent=accent)
        gloss = VarGlossary([
            ("g", "已走步数 = dist", C_G),
            ("q", "FIFO 队头出尾进", accent),
            ("par", "回溯父指针", C_VIS_MID),
        ])
        _layout_demo(code, map_block, qstrip, title, gloss, grid_map)
        # 格内字号随格子实际大小：白字加粗居中
        _tw = next(iter(grid_map.tiles.values())).width
        vars_layer.font_size = max(15, min(22, int(_tw * 36)))

        cap = BottomCaption(self)
        cursor = SoftCursor()
        self.add(code)
        code.reveal_all(self, run_time=0.75)
        self.play(FadeIn(bundle), FadeIn(qstrip), FadeIn(gloss), run_time=0.6, rate_func=ease_out_cubic)
        self.add(vars_layer)
        self.bring_to_front(grid_map.markers)

        # ── 详尽开场 ──
        cap.show("BFS：单位步长的最短路 —— 先入队的格子一定先扩展")
        self.wait(1.1)

        code.highlight_lines(self, [2], color=C_G, run_time=0.5)
        gloss.light(self, "g")
        cap.show("g：从起点走到该格的步数；边权恒为 1 时，g 就是 dist")
        self.wait(1.15)

        code.highlight_lines(self, [1], color=accent, run_time=0.45)
        gloss.light(self, "q")
        cap.show("q：双端队列 deque —— 左侧 front 弹出，右侧 back 追加，保证按层扩展")
        self.wait(1.2)

        code.highlight_lines(self, [3], color=C_VIS_MID, run_time=0.45)
        gloss.light(self, "par")
        cap.show("parent：记录「谁把我入队」—— 最后沿指针回溯成完整路径")
        self.wait(1.15)

        q = deque([start])
        dist = {start: 0}
        parent = {start: None}
        qstrip.sync_instant([start])

        anims = vars_layer.set_vars(start, g=0, animate=True)
        code.highlight_lines(self, [1, 2, 3], color=accent, run_time=0.45)
        if anims:
            self.play(*anims, run_time=0.55)
        cap.show("初始化：起点入队，格子写 g=0；队列色块与格子同色（黄描边 F: = 队头）")
        self.wait(1.25)

        code.highlight_lines(self, [4], color=YELLOW, run_time=0.4)
        cap.show("主循环：只要队列非空，就取出队头继续向外扩张一层")
        self.wait(1.0)

        step_i = 0
        while q:
            rt = step_runtime(step_i, slow=1.05, warm=warm)
            detail = step_i < warm
            hl = max(0.22, rt * 0.45) if detail else 0.0

            if detail:
                code.highlight_lines(self, [5], color=YELLOW, run_time=hl)
            u = q.popleft()
            cursor.move_to(self, grid_map, u, run_time=max(0.14, rt * 0.55))
            # 当前扩展格短暂高亮数值
            hot_anims = vars_layer.set_vars(u, g=dist[u], hot=True, animate=detail)
            qstrip.sync_instant(list(q))
            if hot_anims:
                self.play(*hot_anims, run_time=rt)

            if detail:
                code.highlight_lines(self, [6, 7], color=C_GOAL, run_time=hl)
                cap.show(f"弹出队头 u，当前 g={dist[u]}；若 u 是终点即可停止搜索")
                self.wait(0.5)
            if u == goal:
                done = _mark_searched(
                    grid_map, vars_layer, u, start=start, goal=goal, animate=detail,
                )
                if done:
                    self.play(*done, run_time=max(0.12, rt * 0.4))
                cap.show(f"到达终点！最短步数就是 g={dist[u]}（BFS 保证首次到达即最优）")
                self.wait(max(0.55, rt))
                break

            newborn = []
            for ni, nj, _ in _neighbors4(*u):
                v = (ni, nj)
                if v in dist or not GRID[ni, nj]:
                    continue
                dist[v] = dist[u] + 1
                parent[v] = u
                q.append(v)
                newborn.append(v)

            if detail:
                code.highlight_lines(self, [8, 9, 10], color=C_VIS_MID, run_time=hl)
                self.wait(0.25)
                if newborn:
                    code.highlight_lines(self, [11, 12, 13], color=accent, run_time=hl)
                    paints = []
                    for v in newborn:
                        if v in grid_map.tiles and v not in (start, goal):
                            col = ManimColor(_cell_color(v))
                            grid_map.tiles[v].set_fill(col, opacity=0.9)
                            paints.append(
                                grid_map.tiles[v].animate.set_fill(col, opacity=0.9)
                            )
                        paints.extend(vars_layer.set_vars(v, g=dist[v], animate=True))
                    qstrip.sync_instant(list(q))
                    if paints:
                        self.play(*paints, run_time=rt)
                    cap.show(
                        f"四邻域入队：邻居 g={dist[u]+1}；队列色块颜色与对应格子一致"
                    )
                    self.wait(0.55)
            else:
                # 加速段：必须瞬间 set_fill，不能只靠极短 animate（易丢最终填色）
                for v in newborn:
                    if v in grid_map.tiles and v not in (start, goal):
                        grid_map.tiles[v].set_fill(
                            ManimColor(_cell_color(v)), opacity=0.9,
                        )
                    vars_layer.set_vars(v, g=dist[v], animate=False)
                qstrip.sync_instant(list(q))
                self.wait(max(rt, 1 / 60))

            # 扩展完毕：数值消失，留下青蓝扫过残影
            closed_anims = _mark_searched(
                grid_map, vars_layer, u, start=start, goal=goal, animate=detail,
            )
            if closed_anims:
                self.play(*closed_anims, run_time=max(0.1, rt * 0.35))
            self.bring_to_front(grid_map.markers)
            step_i += 1
            if step_i > 80:
                break

        path = _reconstruct(parent, goal)
        code.highlight_lines(self, [14], color=C_PATH, run_time=0.4)
        cap.show(f"沿 parent 从终点一路指回起点 · 路径长度 {max(len(path) - 1, 0)} 步")
        cursor.fade(self)
        if path:
            self.play(Create(_path_on_map(grid_map, path, C_PATH)), run_time=0.9, rate_func=ease_in_out_cubic)
        self.wait(1.1)
        code.clear_highlight(self)
        cap.clear()
        self.wait(0.2)


# ── A* ──────────────────────────────────────────────────────


class AStarCodeDemoScene(Scene):
    def construct(self):
        self.camera.background_color = ManimColor(BG)
        start, goal = BOMB_IJ, SURVIVOR_IJ
        accent = "#a78bfa"
        warm = 9

        title = _title_bar("A* 实际代码", "格内只标 f · 堆对照坐标 · 详尽开场", accent)
        badge = Text("f = g + h", font="Consolas", font_size=18, color=accent).to_corner(UR, buff=0.3)
        self.play(FadeIn(title), FadeIn(badge), run_time=0.45, rate_func=ease_out_cubic)

        code = _make_code(ASTAR_CODE)
        grid_map, bundle = _bundle_map(start, goal)
        vars_layer = CellVarLayer(grid_map, font_size=18)
        map_block = bundle
        heap = HeapStrip(accent=accent)
        gloss = VarGlossary([
            ("g", "已走代价", C_G),
            ("h", "启发距离", C_H),
            ("f", "格内只显示 f", C_F),
            ("pq", "最小堆 open", accent),
        ])
        _layout_demo(code, map_block, heap, title, gloss, grid_map)
        _tw = next(iter(grid_map.tiles.values())).width
        vars_layer.font_size = max(15, min(22, int(_tw * 36)))

        cap = BottomCaption(self)
        cursor = SoftCursor()
        self.add(code)
        code.reveal_all(self, run_time=0.75)
        self.play(FadeIn(bundle), FadeIn(heap), FadeIn(gloss), run_time=0.6, rate_func=ease_out_cubic)
        self.add(vars_layer)
        self.bring_to_front(grid_map.markers)

        def h_fn(n):
            return float(np.hypot(n[0] - goal[0], n[1] - goal[1]))

        # ── 详尽开场 ──
        cap.show("A*：在 BFS/Dijkstra 上加启发，优先扩展「看起来更靠近终点」的格子")
        self.wait(1.2)

        code.highlight_lines(self, [3], color=C_G, run_time=0.5)
        gloss.light(self, "g")
        cap.show("g：从起点走到当前格的实际代价（八连通，对角 √2）")
        self.wait(1.15)

        code.highlight_lines(self, [1, 2], color=C_H, run_time=0.45)
        gloss.light(self, "h")
        cap.show("h：启发式 —— 到终点的欧氏距离，只估计、不走路")
        self.wait(1.15)

        gloss.light(self, "f")
        cap.show("f = g + h：地图格子只标 f，避免 g/h/f 挤在一起；细节看下方堆")
        self.wait(1.2)

        code.highlight_lines(self, [5, 6], color=accent, run_time=0.45)
        gloss.light(self, "pq")
        cap.show("open_pq：最小堆存待扩展节点；closed：已确定最优、留下扫过残影且数值消失")
        self.wait(1.15)

        g = {start: 0.0}
        parent = {start: None}
        h0 = h_fn(start)
        open_pq = [(h0, 0.0, start)]
        closed: set = set()

        anims = vars_layer.set_vars(start, f=h0, animate=True)
        heap.refresh([(h0, 0.0, start)])
        code.highlight_lines(self, [3, 4, 5, 6], color=accent, run_time=0.5)
        if anims:
            self.play(*anims, run_time=0.55)
        cap.show(f"初始化：起点 f={h0:.1f}（g=0，h={h0:.1f}），压入 open 堆顶")
        self.wait(1.2)

        code.highlight_lines(self, [7], color=YELLOW, run_time=0.4)
        cap.show("主循环：每次 heappop 取出当前 f 最小的候选")
        self.wait(1.0)

        step_i = 0
        while open_pq:
            rt = step_runtime(step_i, slow=1.0, fast=0.1, warm=warm)
            detail = step_i < warm
            hl = max(0.2, rt * 0.4) if detail else 0.0

            if detail:
                code.highlight_lines(self, [8], color=YELLOW, run_time=hl)
            f, g_u, u = heapq.heappop(open_pq)
            hu = h_fn(u)
            cursor.move_to(self, grid_map, u, run_time=max(0.14, rt * 0.5))
            anims = vars_layer.set_vars(u, f=f, hot=True, animate=detail)
            heap.refresh(open_pq)
            if anims:
                self.play(*anims, run_time=rt)

            if detail and step_i < 5:
                cap.show(f"堆顶弹出 → f={f:.1f}（g={g_u:.1f} h={hu:.1f} 见堆块）")
                self.wait(0.45)

            if detail:
                code.highlight_lines(self, [9, 10], color=C_VIS_MID, run_time=hl)
            if u in closed:
                if detail:
                    cap.show("已在 closed：说明更优路径已处理过，跳过重复堆项")
                    self.wait(0.35)
                continue

            if detail:
                code.highlight_lines(self, [11], color=accent, run_time=hl)
            closed.add(u)

            if detail:
                code.highlight_lines(self, [12, 13], color=C_GOAL, run_time=hl)
            if u == goal:
                done = _mark_searched(
                    grid_map, vars_layer, u, start=start, goal=goal, animate=detail,
                )
                if done:
                    self.play(*done, run_time=max(0.12, rt * 0.4))
                cap.show(f"到达终点！最终代价 g={g_u:.1f}（h 已为 0，故 f≈g）")
                self.wait(max(0.6, rt))
                break

            improved = []
            for ni, nj, w in _neighbors8(*u):
                v = (ni, nj)
                if v in closed or not GRID[ni, nj]:
                    continue
                g_v = g_u + w
                if g_v < g.get(v, np.inf):
                    g[v] = g_v
                    parent[v] = u
                    hv = h_fn(v)
                    fv = g_v + hv
                    heapq.heappush(open_pq, (fv, g_v, v))
                    improved.append((v, g_v, hv, fv))

            if detail:
                code.highlight_lines(self, [14, 15, 16], color=C_VIS_MID, run_time=hl)
                if improved:
                    code.highlight_lines(self, [17, 18, 19, 20, 21], color=accent, run_time=hl)
                    paints = []
                    for v, g_v, hv, fv in improved:
                        if v in grid_map.tiles and v not in (start, goal):
                            col = ManimColor(_cell_color(v))
                            grid_map.tiles[v].set_fill(col, opacity=0.9)
                            paints.append(
                                grid_map.tiles[v].animate.set_fill(col, opacity=0.9)
                            )
                        paints.extend(vars_layer.set_vars(v, f=fv, animate=True))
                    heap.refresh(open_pq)
                    if paints:
                        self.play(*paints, run_time=rt)
                    cap.show(
                        f"松弛成功 {len(improved)} 格：格内只写 f，"
                        f"堆块颜色与对应格子一致"
                    )
                    self.wait(0.55)
            else:
                for v, g_v, hv, fv in improved:
                    if v in grid_map.tiles and v not in (start, goal):
                        grid_map.tiles[v].set_fill(
                            ManimColor(_cell_color(v)), opacity=0.9,
                        )
                    vars_layer.set_vars(v, f=fv, animate=False)
                heap.refresh(open_pq)
                self.wait(max(rt, 1 / 60))

            # closed：数值消失 + 扫过残影
            closed_anims = _mark_searched(
                grid_map, vars_layer, u, start=start, goal=goal, animate=detail,
            )
            if closed_anims:
                self.play(*closed_anims, run_time=max(0.1, rt * 0.35))
            self.bring_to_front(grid_map.markers)

            step_i += 1
            if step_i > 60:
                break

        path = _reconstruct(parent, goal)
        code.highlight_lines(self, [22], color=C_PATH, run_time=0.4)
        cap.show("沿 parent 从终点回溯到起点，画出最优路径")
        cursor.fade(self)
        if path:
            self.play(Create(_path_on_map(grid_map, path, C_PATH)), run_time=0.9, rate_func=ease_in_out_cubic)
        self.wait(1.1)
        code.clear_highlight(self)
        cap.clear()
        self.wait(0.2)


# ── 预烘焙 O(1) 查表 ────────────────────────────────────────


class PrebakeLookupCodeDemoScene(Scene):
    def construct(self):
        self.camera.background_color = ManimColor(BG)
        accent = "#3de0c8"
        hot = C_VIS_HOT

        title = _title_bar("预烘焙 O(1) 查表", "power / arrival 分色 · 详尽开场", accent)
        badge = Text("runtime O(1)", font="Consolas", font_size=18, color=accent).to_corner(UR, buff=0.3)
        self.play(FadeIn(title), FadeIn(badge), run_time=0.45, rate_func=ease_out_cubic)

        code = _make_code(LOOKUP_CODE)
        table, probe, hp_bar, cell_vars = self._build_lookup_viz()
        rec = RecStrip(accent=accent)
        gloss = VarGlossary([
            ("p", "伤害 power", C_P),
            ("a", "到达时间 arrival", C_A),
            ("rec", "烘焙记录", accent),
        ])
        map_block = VGroup(table, cell_vars, probe)
        _layout_demo(code, map_block, VGroup(rec, hp_bar).arrange(DOWN, buff=0.2), title, gloss)

        cap = BottomCaption(self)
        self.add(code)
        code.reveal_all(self, run_time=0.7)
        self.play(FadeIn(map_block), FadeIn(rec), FadeIn(hp_bar), FadeIn(gloss), run_time=0.6)

        cells = table[1]
        demo = []
        for i in range(len(cells)):
            t = i / max(len(cells) - 1, 1)
            power = int(20 + 80 * (1 - abs(t - 0.35)))
            arrival = 0.12 + 0.55 * abs(t - 0.2)
            demo.append((power, arrival))

        cap.show("思路：把「搜路」放到编译期，运行时只查表 —— 爆炸伤害就能 O(1) 结算")
        self.wait(1.2)

        code.highlight_lines(self, [3], color=C_P, run_time=0.45)
        gloss.light(self, "p")
        cap.show("power (粉)：该格受到的冲击波伤害强度，随距离衰减")
        self.wait(1.15)

        code.highlight_lines(self, [2], color=C_A, run_time=0.45)
        gloss.light(self, "a")
        cap.show("arrival (蓝)：波前到达该格的时间；到点后才允许扣血")
        self.wait(1.15)

        gloss.light(self, "rec")
        code.highlight_lines(self, [0], color=C_VIS_MID, run_time=0.4)
        cap.show("编译期：对每个可行走格跑一遍波前 Dijkstra，写入 field[site][cell]")
        self.wait(1.15)

        code.highlight_lines(self, [1, 2, 3, 4], color=accent, run_time=0.4)
        cap.show("写入公式：arrival = dist / WAVE_SPEED，power = falloff(dist)")
        self.wait(0.9)

        for i, cell in enumerate(cells):
            rt = step_runtime(i, slow=0.75, fast=0.1, warm=6)
            power, arrival = demo[i]
            t = i / max(len(cells) - 1, 1)
            col = interpolate_color(
                ManimColor("#1a2332"), ManimColor(hot),
                0.15 + 0.8 * (1 - abs(t - 0.35)),
            )
            pair = cell_vars[i]
            new_p = Text(f"p={power}", font="Consolas", font_size=13, color=C_P, weight=BOLD)
            new_a = Text(f"a={arrival:.2f}", font="Consolas", font_size=12, color=C_A, weight=BOLD)
            if new_p.width > cell.width * 0.88:
                new_p.set_width(cell.width * 0.88)
            if new_a.width > cell.width * 0.9:
                new_a.set_width(cell.width * 0.9)
            new_p.move_to(pair[0].get_center())
            new_a.move_to(pair[1].get_center())
            self.play(
                cell.animate.set_fill(col, opacity=0.95),
                Transform(pair[0], new_p),
                Transform(pair[1], new_a),
                run_time=rt,
                rate_func=smooth,
            )
            if i < 3 or i == len(cells) - 1:
                rec.update_rec(self, power, arrival, run_time=min(0.28, rt))
            if i < 3:
                cap.show(f"烘焙格 {i}：写入 p={power}、a={arrival:.2f}，下方卡片同步变色")
                self.wait(0.4)

        code.highlight_lines(self, [6, 7], color=YELLOW, run_time=0.4)
        cap.show("运行时：每一 tick 只做下标访问，不再跑搜路")
        self.wait(1.0)

        code.highlight_lines(self, [8, 9], color=accent, run_time=0.35)
        cap.show("用波前时间 + 玩家坐标算出 cell，取出 baked 记录")
        self.wait(0.85)

        idx = 11
        target = cells[idx]
        power, arrival = demo[idx]
        code.highlight_lines(self, [10], color=YELLOW, run_time=0.35)
        cap.show(f"查表：rec.power={power}，rec.arrival={arrival:.2f}s")
        self.play(probe.animate.move_to(target.get_center()), run_time=0.55, rate_func=ease_in_out_cubic)
        flash = SurroundingRectangle(target, color=YELLOW, buff=0.04, stroke_width=3, fill_opacity=0)
        rec.update_rec(self, power, arrival, run_time=0.35)
        self.play(Create(flash), run_time=0.3)
        self.wait(0.55)

        code.highlight_lines(self, [11, 12], color=hot, run_time=0.35)
        cap.show("仅当 wave_front ≥ arrival 时才 ApplyDamage，避免提前扣血")
        self.wait(0.95)

        code.highlight_lines(self, [13], color=accent, run_time=0.35)
        hp_max = 84
        preview = hp_max - power
        cap.show(f"预览剩余 HP：{hp_max} − power({power}) = {preview}")
        track, fill, hp_lab = hp_bar[0], hp_bar[1], hp_bar[2]
        inner = max(float(track.width) - 0.1, 0.2)
        target_w = max(inner * preview / hp_max, 0.08)
        # 用 Transform 缩短血条，并同步更新标签（避免 animate 链式失效）
        new_fill = RoundedRectangle(
            width=target_w,
            height=fill.height,
            corner_radius=0.06,
            fill_color="#f87171" if preview < hp_max * 0.35 else "#3dd68c",
            fill_opacity=1,
            stroke_width=0,
        )
        new_fill.move_to(track.get_center()).align_to(track, LEFT).shift(RIGHT * 0.05)
        new_lab = Text(
            f"preview HP  {preview}/{hp_max}",
            font=UI_FONT, font_size=14, color=C_SUB,
        )
        new_lab.next_to(track, UP, buff=0.06)
        hp_num = Text(
            f"{preview}/{hp_max}",
            font="Consolas", font_size=18, color=WHITE, weight=BOLD,
        )
        hp_num.move_to(track.get_center())
        self.play(
            Transform(fill, new_fill),
            Transform(hp_lab, new_lab),
            run_time=0.8,
            rate_func=ease_in_out_cubic,
        )
        # 公式放血条右侧，避免与下方图例叠字；空间不够再下移图例
        hp_lbl = Text(
            f"HP {hp_max} - {power} = {preview}",
            font="Consolas", font_size=16, color=hot, weight=BOLD,
        )
        hp_lbl.next_to(track, RIGHT, buff=0.16)
        hp_lbl.set_z_index(50)
        if hp_lbl.get_right()[0] > FRAME_RIGHT - 0.05:
            self.play(gloss.animate.shift(DOWN * 0.48), run_time=0.22)
            hp_lbl.next_to(hp_bar, DOWN, buff=0.12)
            hp_lbl.set_z_index(50)
        self.play(FadeIn(hp_num), FadeIn(hp_lbl), run_time=0.3)
        self.wait(1.0)

        cap.show("离线搜路烘焙一次 → 线上每帧 O(1) 查表，这就是预计算的价值")
        self.wait(1.1)
        code.clear_highlight(self)
        cap.clear()
        self.play(FadeOut(flash), run_time=0.2)
        self.wait(0.15)

    def _build_lookup_viz(self):
        title = Text("baked_field[site]", font="Consolas", font_size=16, color=C_SUB)
        rows, cols = 4, 5
        cells = VGroup()
        values = VGroup()
        for r in range(rows):
            for c in range(cols):
                sq = Square(
                    side_length=0.48,
                    stroke_width=1.0,
                    stroke_color="#3a4a60",
                    fill_color=C_FLOOR,
                    fill_opacity=1,
                )
                sq.move_to(np.array([c * 0.54, -r * 0.54, 0]))
                cells.add(sq)
                p = Text("p=--", font="Consolas", font_size=13, color=C_P, weight=BOLD).set_opacity(0.35)
                a = Text("a=--", font="Consolas", font_size=12, color=C_A, weight=BOLD).set_opacity(0.35)
                p.move_to(sq.get_center() + UP * 0.08)
                a.move_to(sq.get_center() + DOWN * 0.10)
                values.add(VGroup(p, a))
        box = SurroundingRectangle(cells, color="#2a3a55", buff=0.12, stroke_width=1.4)
        title.next_to(VGroup(box, cells), UP, buff=0.1)
        table = VGroup(title, cells, box)
        values.move_to(cells.get_center())

        probe = Dot(radius=0.09, color=YELLOW).move_to(cells[0].get_center())
        track = RoundedRectangle(
            width=2.8, height=0.32, corner_radius=0.08,
            fill_color="#1a2230", fill_opacity=1, stroke_color="#3a4a60",
        )
        # 初始满血 84/84
        fill = RoundedRectangle(
            width=2.6, height=0.22, corner_radius=0.06,
            fill_color="#3dd68c", fill_opacity=1, stroke_width=0,
        )
        fill.move_to(track.get_center()).align_to(track, LEFT).shift(RIGHT * 0.05)
        hp_lab = Text("preview HP  84/84", font=UI_FONT, font_size=14, color=C_SUB)
        hp_bar = VGroup(track, fill, hp_lab)
        hp_lab.next_to(track, UP, buff=0.06)
        return table, probe, hp_bar, values
