# rainbow_yu manim_extend.basic_unit.code_step 🐋✨
# code on step

from __future__ import annotations

from manim import *


class CodeStep(Code):
    """
    可分步写出的代码块，继承于 :class:`~.Code`。

    - :meth:`write_code` 按行写出；``is_auto_runtime=True`` 时按字符量估时长
    - :meth:`highlight_lines` / :meth:`focus_lines` / :meth:`clear_highlight` 讲解高亮
    - :meth:`step` 写出并高亮一段，可选旁注
    - :meth:`play_script` 按脚本批量推进

    Examples
    --------

    >>> class CodeShow(Scene):
    >>>     def construct(self):
    >>>         c1 = CodeStep(code_string="a = 1\\nb = 2", language="python")
    >>>         c1.prepare(self)
    >>>         c1.write_code(self, 1, is_auto_runtime=True)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.lines = 0
        self._highlights: VGroup = VGroup()
        self._dimmed: list[tuple[Mobject, float]] = []
        self._note: Mobject | None = None

    # ── 结构访问 ─────────────────────────────────────────────

    @property
    def code_body(self) -> Mobject:
        """代码行所在 VGroup（不含边框；含/不含行号取决于 Manim 版本布局）。"""
        if hasattr(self, "code_lines") and self.code_lines is not None:
            return self.code_lines
        return self[2]

    @property
    def n_code_lines(self) -> int:
        return len(self.code_body)

    def line(self, i: int) -> Mobject:
        """0-based 代码行。"""
        return self.code_body[i]

    def line_slice(self, start: int, end: int | None = None) -> VGroup:
        end = self.n_code_lines if end is None else end
        return VGroup(*[self.line(i) for i in range(start, end)])

    # ── 准备 / 写出 ──────────────────────────────────────────

    def prepare(
        self,
        scene: Scene | None = None,
        *,
        hide: bool = True,
        scale: float = 1.0,
    ) -> CodeStep:
        """缩放入场；默认把代码行设为透明，便于随后 Write。"""
        if scale != 1.0:
            self.scale(scale)
        if hide:
            self.code_body.set_opacity(0)
        if scene is not None:
            scene.add(self)
        return self

    def write_code(
        self,
        scene: Scene,
        lines: int,
        is_auto_runtime: bool = True,
        **kwargs,
    ) -> CodeStep:
        """写出接下来 ``lines`` 行。"""
        end_line = min(self.lines + lines, self.n_code_lines)
        chunk = self.line_slice(self.lines, end_line)
        chunk.set_opacity(1)
        if is_auto_runtime and "run_time" not in kwargs:
            kwargs["run_time"] = self.auto_runtime(end_line - self.lines)
        scene.play(Write(chunk), **kwargs)
        self.lines = end_line
        return self

    def write_remaining(self, scene: Scene, is_auto_runtime: bool = True, **kwargs) -> CodeStep:
        left = self.n_code_lines - self.lines
        if left <= 0:
            return self
        return self.write_code(scene, left, is_auto_runtime=is_auto_runtime, **kwargs)

    def reveal_all(self, scene: Scene, run_time: float = 0.45, **kwargs) -> CodeStep:
        """一次性淡入全部未写出的行（不逐字 Write）。"""
        chunk = self.line_slice(self.lines)
        chunk.set_opacity(0)
        scene.play(chunk.animate.set_opacity(1), run_time=run_time, **kwargs)
        self.lines = self.n_code_lines
        return self

    def auto_runtime(self, lines: int) -> float:
        """按即将写出的字符量估算时长。"""
        total_length = 0
        end = min(self.lines + lines, self.n_code_lines)
        for i in range(self.lines, end):
            total_length += max(len(self.line(i)), 1)
        if total_length == 0:
            total_length = 1.5
        return max(total_length / 15.0, 0.25)

    # ── 高亮 / 聚焦 ──────────────────────────────────────────

    def highlight_lines(
        self,
        scene: Scene,
        indices: int | list[int] | range,
        *,
        color=YELLOW,
        buff: float = 0.05,
        stroke_width: float = 2.5,
        run_time: float = 0.3,
        clear: bool = True,
        **kwargs,
    ) -> CodeStep:
        """给若干行加描边高亮框；已有框时用 Transform 丝滑滑动。"""
        if isinstance(indices, int):
            indices = [indices]
        indices = sorted({int(i) for i in indices if 0 <= int(i) < self.n_code_lines})
        if not indices:
            if clear:
                self.clear_highlight(scene, run_time=min(0.15, run_time), animate=True)
            return self

        # 连续行合并为一个框，更干净
        groups: list[list[int]] = [[indices[0]]]
        for i in indices[1:]:
            if i == groups[-1][-1] + 1:
                groups[-1].append(i)
            else:
                groups.append([i])

        targets = VGroup()
        for g in groups:
            target = VGroup(*[self.line(i) for i in g])
            box = SurroundingRectangle(
                target,
                color=color,
                buff=buff,
                stroke_width=stroke_width,
                fill_opacity=0.0,
            )
            targets.add(box)

        rate = kwargs.pop("rate_func", smooth)
        old = self._highlights
        n_old, n_new = len(old), len(targets)

        if n_old == 0:
            scene.play(Create(targets), run_time=run_time, rate_func=rate, **kwargs)
            self._highlights = targets
            scene.add(self._highlights)
            return self

        anims = []
        n_shared = min(n_old, n_new)
        for i in range(n_shared):
            # 颜色也一并过渡
            targets[i].set_color(color)
            anims.append(Transform(old[i], targets[i]))
        if n_old > n_new:
            anims.append(FadeOut(VGroup(*[old[i] for i in range(n_new, n_old)])))
        if n_new > n_old:
            extras = VGroup(*[targets[i] for i in range(n_old, n_new)])
            anims.append(FadeIn(extras))
            for i in range(n_old, n_new):
                old.add(targets[i])

        scene.play(*anims, run_time=run_time, rate_func=rate, **kwargs)

        # Transform 会改写 old[i] 的几何；多余已 FadeOut，裁掉
        if n_old > n_new:
            kept = VGroup(*[old[i] for i in range(n_new)])
            scene.remove(old)
            self._highlights = kept
            scene.add(self._highlights)
        else:
            self._highlights = old
            scene.add(self._highlights)
        return self

    def clear_highlight(
        self,
        scene: Scene,
        *,
        run_time: float = 0.25,
        animate: bool = True,
    ) -> CodeStep:
        if len(self._highlights) == 0:
            return self
        if animate:
            scene.play(FadeOut(self._highlights), run_time=run_time)
        else:
            scene.remove(self._highlights)
        self._highlights = VGroup()
        return self

    def focus_lines(
        self,
        scene: Scene,
        indices: int | list[int] | range,
        *,
        dim_opacity: float = 0.28,
        run_time: float = 0.35,
        **kwargs,
    ) -> CodeStep:
        """聚焦若干行，其余行降透明度。"""
        if isinstance(indices, int):
            indices = [indices]
        focus = set(indices)
        self.restore_focus(scene, animate=False)
        anims = []
        for i in range(self.n_code_lines):
            mob = self.line(i)
            if i not in focus:
                self._dimmed.append((mob, 1.0))
                anims.append(mob.animate.set_opacity(dim_opacity))
            else:
                anims.append(mob.animate.set_opacity(1.0))
        if anims:
            scene.play(*anims, run_time=run_time, **kwargs)
        return self

    def restore_focus(self, scene: Scene, *, run_time: float = 0.3, animate: bool = True) -> CodeStep:
        if self._dimmed:
            targets = [mob for mob, _ in self._dimmed]
            self._dimmed.clear()
            if animate and targets:
                scene.play(*[m.animate.set_opacity(1.0) for m in targets], run_time=run_time)
            else:
                for mob in targets:
                    mob.set_opacity(1.0)
            return self
        written = self.line_slice(0, max(self.lines, 0))
        if self.lines > 0:
            if animate:
                scene.play(written.animate.set_opacity(1), run_time=run_time)
            else:
                written.set_opacity(1)
        return self

    # ── 步进脚本 ─────────────────────────────────────────────

    def show_note(
        self,
        scene: Scene,
        text: str,
        *,
        font: str | None = None,
        font_size: int = 24,
        color=GREY_A,
        direction=DOWN,
        buff: float = 0.28,
        run_time: float = 0.3,
    ) -> CodeStep:
        if font is None:
            try:
                from yty_manim.disposition.fonts_and_colors import UI_FONT

                font = UI_FONT
            except Exception:
                font = "Sans"
        note = Text(text, font=font, font_size=font_size, color=color)
        note.next_to(self, direction, buff=buff)
        max_w = max(self.width * 0.98, 5.5)
        if note.width > max_w:
            note.set_width(max_w)
        if self._note is not None:
            scene.play(ReplacementTransform(self._note, note), run_time=run_time)
        else:
            scene.play(FadeIn(note, shift=UP * 0.06), run_time=run_time)
        self._note = note
        return self

    def clear_note(self, scene: Scene, run_time: float = 0.25) -> CodeStep:
        if self._note is None:
            return self
        scene.play(FadeOut(self._note), run_time=run_time)
        self._note = None
        return self

    def step(
        self,
        scene: Scene,
        lines: int = 1,
        *,
        note: str | None = None,
        highlight: bool = True,
        color=YELLOW,
        wait: float = 0.35,
        is_auto_runtime: bool = True,
        **kwargs,
    ) -> CodeStep:
        """写出 ``lines`` 行 → 高亮刚写出的行 → 可选旁注。"""
        start = self.lines
        self.write_code(scene, lines, is_auto_runtime=is_auto_runtime, **kwargs)
        end = self.lines
        if highlight and end > start:
            self.highlight_lines(scene, range(start, end), color=color, clear=True)
        if note:
            self.show_note(scene, note)
        if wait > 0:
            scene.wait(wait)
        return self

    def play_script(
        self,
        scene: Scene,
        steps: list,
        *,
        default_color=YELLOW,
        default_wait: float = 0.35,
    ) -> CodeStep:
        """
        批量执行步骤。每项可为 ``{"lines": 2, "note": "...", "color": TEAL}``
        或 ``(lines, note)``。
        """
        for item in steps:
            if isinstance(item, tuple):
                lines = int(item[0])
                note = item[1] if len(item) > 1 else None
                color = default_color
                wait = default_wait
            else:
                lines = int(item.get("lines", 1))
                note = item.get("note")
                color = item.get("color", default_color)
                wait = float(item.get("wait", default_wait))
            self.step(scene, lines, note=note, color=color, wait=wait)
        return self
