# rainbow_yu — 导数法：√37 与 √35 谁离 6 更近
"""画 √x → 小球沿曲线比较 → 算导数 → 用导数说明。

Usage:
    python -m manim -qh --disable_caching video_project/math_demos/sqrt_near_6.py SqrtNear6Scene
"""

from __future__ import annotations

import numpy as np
from manim import *

from yty_manim.disposition.fonts_and_colors import UI_FONT

__all__ = ("SqrtNear6Scene",)

BG = "#0b1020"
C_AXIS = "#64748b"
C_CURVE = "#38bdf8"
C_SIX = "#fbbf24"
C_LEFT = "#fb7185"
C_RIGHT = "#34d399"
C_DER = "#c4b5fd"
C_BALL = "#fde68a"
C_TITLE = "#f1f5ff"
C_SUB = "#a8b4c8"


def _cn(text: str, size: int = 28, color=C_TITLE) -> Text:
    t = Text(text, font=UI_FONT, font_size=size, color=ManimColor(color))
    t.set_fill(ManimColor(color), opacity=1)
    t.set_stroke(width=0, opacity=0)
    return t


def _mono(text: str, size: int = 28, color=WHITE) -> Text:
    font = UI_FONT if ("√" in text or "ξ" in text) else "Consolas"
    t = Text(text, font=font, font_size=size, color=ManimColor(color))
    t.set_fill(ManimColor(color), opacity=1)
    t.set_stroke(width=0, opacity=0)
    return t


class SqrtNear6Scene(Scene):
    """图像 + 小球比较 + 导数计算 + 说明结论。"""

    def construct(self):
        self.camera.background_color = ManimColor(BG)
        y35, y37 = float(np.sqrt(35)), float(np.sqrt(37))
        gap_l, gap_r = 6 - y35, y37 - 6
        # 导数数值
        fp35 = 1 / (2 * np.sqrt(35))
        fp36 = 1 / (2 * 6)
        fp37 = 1 / (2 * np.sqrt(37))

        # ── 标题 ──
        title = _cn("谁离 6 更近？", 32, C_TITLE)
        sub = _cn("图像 · 小球比较 · 导数说明", 18, C_SUB)
        head = VGroup(title, sub).arrange(DOWN, buff=0.08).to_edge(UP, buff=0.18)
        self.play(FadeIn(head), run_time=0.35)

        # ════════════════════════════════════════
        # 阶段 1：画出 y = √x（局部放大，便于比较）
        # ════════════════════════════════════════
        ax = Axes(
            x_range=[34.4, 37.6, 0.5],
            y_range=[5.82, 6.18, 0.05],
            x_length=9.6,
            y_length=4.2,
            axis_config={
                "color": C_AXIS,
                "stroke_width": 2,
                "include_tip": True,
                "tip_length": 0.12,
            },
        ).shift(DOWN * 0.35)

        ax_x = _mono("x", 20, C_SUB).next_to(ax.x_axis.get_end(), RIGHT, buff=0.08)
        ax_y = _mono("y", 20, C_SUB).next_to(ax.y_axis.get_end(), UP, buff=0.08)
        curve = ax.plot(lambda x: np.sqrt(x), x_range=[34.4, 37.6], color=C_CURVE, stroke_width=4)
        curve_lab = _mono("y = √x", 24, C_CURVE)
        curve_lab.next_to(ax.c2p(37.2, np.sqrt(37.2)), UL, buff=0.08)

        ticks = VGroup(
            _mono("35", 18, C_LEFT).next_to(ax.c2p(35, 5.82), DOWN, buff=0.1),
            _mono("36", 18, C_SIX).next_to(ax.c2p(36, 5.82), DOWN, buff=0.1),
            _mono("37", 18, C_RIGHT).next_to(ax.c2p(37, 5.82), DOWN, buff=0.1),
        )
        # y=6 参考线
        ref6 = DashedLine(
            ax.c2p(34.4, 6), ax.c2p(37.6, 6),
            color=C_SIX, stroke_width=1.6, stroke_opacity=0.7,
        )
        ref6_lab = _mono("y = 6", 16, C_SIX).next_to(ax.c2p(34.55, 6), UP, buff=0.06)

        self.play(Create(ax), FadeIn(ax_x), FadeIn(ax_y), run_time=0.45)
        self.play(Create(curve), FadeIn(curve_lab), FadeIn(ticks), run_time=0.85)
        self.play(Create(ref6), FadeIn(ref6_lab), run_time=0.4)

        # 三个定点
        d35 = Dot(ax.c2p(35, y35), color=C_LEFT, radius=0.07)
        d36 = Dot(ax.c2p(36, 6), color=C_SIX, radius=0.08)
        d37 = Dot(ax.c2p(37, y37), color=C_RIGHT, radius=0.07)
        self.play(FadeIn(d35), FadeIn(d36), FadeIn(d37), run_time=0.35)

        # ════════════════════════════════════════
        # 阶段 2：小球沿曲线移动比较
        # ════════════════════════════════════════
        ball = Dot(ax.c2p(36, 6), color=C_BALL, radius=0.11)
        ball.set_z_index(20)
        glow = Circle(radius=0.16, color=C_BALL, stroke_width=2, fill_opacity=0)
        glow.move_to(ball.get_center())
        glow.set_z_index(19)
        ball_tag = _cn("小球", 16, C_BALL).next_to(ball, UR, buff=0.08)
        self.play(FadeIn(ball), FadeIn(glow), FadeIn(ball_tag), run_time=0.35)
        self.play(FadeOut(ball_tag), run_time=0.2)

        # 向左滚到 35
        path_left = ax.plot(lambda x: np.sqrt(x), x_range=[35, 36], color=C_LEFT, stroke_width=5)
        path_left.reverse_points()
        trail_l = VMobject(stroke_color=C_LEFT, stroke_width=5)
        trail_l.set_points_as_corners([ax.c2p(36, 6)])

        move_note = _cn("小球向左：36 → 35", 20, C_LEFT)
        move_note.to_corner(UR, buff=0.35)
        self.play(FadeIn(move_note), run_time=0.25)

        def sync_glow(mob):
            glow.move_to(mob.get_center())

        ball.add_updater(sync_glow)
        self.play(
            MoveAlongPath(ball, path_left),
            Create(path_left),
            run_time=1.1,
            rate_func=smooth,
        )
        # 竖直距离
        drop = DashedLine(ax.c2p(35, 6), ax.c2p(35, y35), color=C_LEFT, stroke_width=3)
        bar_l = Line(ax.c2p(34.65, y35), ax.c2p(34.65, 6), color=C_LEFT, stroke_width=6)
        lab_l = VGroup(
            _mono("Δy₁ = 6 − √35", 18, C_LEFT),
            _mono(f"≈ {gap_l:.4f}", 16, C_LEFT),
        ).arrange(DOWN, buff=0.04).next_to(bar_l, LEFT, buff=0.08)
        self.play(Create(drop), Create(bar_l), FadeIn(lab_l), run_time=0.55)
        self.wait(0.2)

        # 回到 36
        self.play(ball.animate.move_to(ax.c2p(36, 6)), run_time=0.4)
        move_note2 = _cn("小球向右：36 → 37", 20, C_RIGHT)
        move_note2.to_corner(UR, buff=0.35)
        self.play(FadeOut(move_note), FadeIn(move_note2), run_time=0.3)

        path_right = ax.plot(lambda x: np.sqrt(x), x_range=[36, 37], color=C_RIGHT, stroke_width=5)
        self.play(
            MoveAlongPath(ball, path_right),
            Create(path_right),
            run_time=1.1,
            rate_func=smooth,
        )
        rise = DashedLine(ax.c2p(37, 6), ax.c2p(37, y37), color=C_RIGHT, stroke_width=3)
        bar_r = Line(ax.c2p(37.35, 6), ax.c2p(37.35, y37), color=C_RIGHT, stroke_width=6)
        lab_r = VGroup(
            _mono("Δy₂ = √37 − 6", 18, C_RIGHT),
            _mono(f"≈ {gap_r:.4f}", 16, C_RIGHT),
        ).arrange(DOWN, buff=0.04).next_to(bar_r, RIGHT, buff=0.08)
        self.play(Create(rise), Create(bar_r), FadeIn(lab_r), run_time=0.55)
        ball.clear_updaters()
        self.play(FadeOut(move_note2), run_time=0.2)

        # 高亮比较：左段更长
        cmp = _cn("肉眼可见：左侧下落更多", 18, C_SIX)
        cmp.to_corner(UR, buff=0.35)
        self.play(
            FadeIn(cmp),
            bar_l.animate.set_stroke(YELLOW, width=8),
            Indicate(bar_l, color=YELLOW, scale_factor=1.05),
            run_time=0.7,
        )
        self.wait(0.3)

        # ════════════════════════════════════════
        # 阶段 3：计算导数
        # ════════════════════════════════════════
        # 收起部分标注，腾出下方公式区
        self.play(FadeOut(cmp), run_time=0.2)
        graph = VGroup(
            ax, ax_x, ax_y, curve, curve_lab, ticks, ref6, ref6_lab,
            d35, d36, d37, ball, glow, path_left, path_right,
            drop, rise, bar_l, bar_r, lab_l, lab_r,
        )
        self.play(graph.animate.scale(0.72).to_edge(UP, buff=0.85), run_time=0.5)
        # 标题上移一点
        self.play(head.animate.scale(0.9).to_edge(UP, buff=0.12), run_time=0.25)

        der_title = _cn("计算导数", 22, C_DER)
        der_body = VGroup(
            _mono("f(x) = √x", 22, C_TITLE),
            _mono("f'(x) = 1 / (2√x)", 24, C_DER),
            _mono(f"f'(35) ≈ {fp35:.4f}", 20, C_LEFT),
            _mono(f"f'(36) ≈ {fp36:.4f}  (= 1/12)", 20, C_SIX),
            _mono(f"f'(37) ≈ {fp37:.4f}", 20, C_RIGHT),
        ).arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        der_block = VGroup(der_title, der_body).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        der_bg = RoundedRectangle(
            width=der_block.width + 0.45, height=der_block.height + 0.32,
            corner_radius=0.12,
            fill_color="#121a2b", fill_opacity=0.97,
            stroke_color=C_DER, stroke_width=1.6,
        )
        der_block.move_to(der_bg)
        der_card = VGroup(der_bg, der_block).next_to(graph, DOWN, buff=0.2).align_to(graph, LEFT)
        if der_card.get_bottom()[1] < -3.4:
            der_card.shift(UP * (-3.4 - der_card.get_bottom()[1]))

        self.play(FadeIn(der_card, shift=UP * 0.08), run_time=0.55)
        # 强调递减
        dec = _cn("观察：f'(35) > f'(36) > f'(37)  ⇒  f' 严格递减", 18, C_SIX)
        dec.next_to(der_card, RIGHT, buff=0.25).align_to(der_card, UP)
        if dec.get_right()[0] > 6.8:
            dec.next_to(der_card, DOWN, buff=0.12).align_to(der_card, LEFT)
        self.play(FadeIn(dec), run_time=0.4)
        self.wait(0.45)

        # ════════════════════════════════════════
        # 阶段 4：根据导数说明
        # ════════════════════════════════════════
        self.play(FadeOut(der_card), FadeOut(dec), run_time=0.3)

        explain = VGroup(
            _cn("用导数说明", 22, C_DER),
            _mono("6 − √35  =  f'(ξ₁) · 1", 20, C_LEFT),
            _mono("√37 − 6  =  f'(ξ₂) · 1", 20, C_RIGHT),
            _mono("ξ₁ ∈ (35,36)  <  ξ₂ ∈ (36,37)", 18, C_SUB),
            _mono("⇒  f'(ξ₁) > f'(ξ₂)", 22, C_TITLE),
            _mono("⇒  6 − √35  >  √37 − 6", 22, C_SIX),
        ).arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        ex_bg = RoundedRectangle(
            width=explain.width + 0.5, height=explain.height + 0.35,
            corner_radius=0.12,
            fill_color="#1a1030", fill_opacity=0.98,
            stroke_color=C_SIX, stroke_width=1.8,
        )
        explain.move_to(ex_bg)
        ex_card = VGroup(ex_bg, explain).next_to(graph, DOWN, buff=0.18)
        self.play(FadeIn(ex_card, shift=UP * 0.08), run_time=0.55)
        self.wait(0.7)

        # 结论
        self.play(FadeOut(ex_card), run_time=0.3)
        verdict = VGroup(
            _cn("结论", 24, C_SIX),
            _mono("|√37 − 6|  <  |6 − √35|", 28, C_TITLE),
            _cn("因此 √37 离 6 更近", 26, C_RIGHT),
        ).arrange(DOWN, buff=0.12)
        v_bg = RoundedRectangle(
            width=verdict.width + 0.6, height=verdict.height + 0.38,
            corner_radius=0.14,
            fill_color="#0f1f18", fill_opacity=0.98,
            stroke_color=C_RIGHT, stroke_width=2.2,
        )
        verdict.move_to(v_bg)
        v_card = VGroup(v_bg, verdict).next_to(graph, DOWN, buff=0.25)
        self.play(FadeIn(v_card, shift=UP * 0.1), run_time=0.55)
        # 小球点头式强调右端点更近：滚回 36 再轻轻偏向 37
        self.play(ball.animate.move_to(ax.c2p(36, 6)), run_time=0.35)
        self.play(ball.animate.move_to(ax.c2p(36.7, np.sqrt(36.7))), run_time=0.45)
        self.wait(1.4)
