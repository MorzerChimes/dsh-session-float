"""生成 dsh-session-float 的设计效果图。

用法：python3 gen.py && for f in *.svg; do rsvg-convert -z 1.5 "$f" -o "${f%.svg}.png"; done
配色遵循 docs/design/README.md §6（灵动岛配色）与 DSH 的 --dsw-* 色板。
"""
from pathlib import Path

OUT = Path(__file__).parent
FONT = "Noto Sans CJK SC, PingFang SC, sans-serif"

# 灵动岛配色（docs/design/README.md §6.1）。深色有意比 DSH 深色（#151517 / #232324）亮一级。
ISL = {
    "light": dict(bg="#FFFFFF", border="rgba(15,17,21,0.10)", fg="#0F1115", fg2="#61666B", fg3="#9A9EA4",
                  hover="#F2F3F5", current="#F6F7F9", divider="#ECEDF0", brand="#0F1115", brand_fg="#FFFFFF",
                  chip="#EEF0F2", track="#E3E5E8", shadow=0.16),
    "dark": dict(bg="#3A3B40", border="rgba(255,255,255,0.12)", fg="#F9FAFB", fg2="#B4B7BD", fg3="#8A8D93",
                 hover="#46474D", current="#424349", divider="#4A4B51", brand="#F9FAFB", brand_fg="#0F1115",
                 chip="#4A4B51", track="#55565C", shadow=0.45),
}
STATUS = {
    "light": dict(pending="#FF9500", completed="#34C759", running="#4176E6"),
    "dark": dict(pending="#FF9F0A", completed="#30D158", running="#7AAAFF"),
}
# DSH page palettes (resolved from dsh-client-ui-theme tokens).
PAGE = {
    "light": dict(bg="#FFFFFF", side="#F9FAFB", line="#ECEDF0", fg="#0F1115", fg2="#61666B", fg3="#9A9EA4",
                  bubble="#F2F3F5", skel="#ECEDF0", input="#FFFFFF", input_border="#DCDDE1"),
    "dark": dict(bg="#151517", side="#1B1B1C", line="#2C2C2E", fg="#F9FAFB", fg2="#A1A4AA", fg3="#6E7177",
                 bubble="#2C2C2E", skel="#232324", input="#232324", input_border="#353638"),
}
LABEL = dict(pending="待处理", completed="已完成", running="进行中")
ANNOT = "#E5484D"


def txt(x, y, s, size=13, fill="#000", weight=400, anchor="start", opacity=1):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}" opacity="{opacity}" font-family="{FONT}">{s}</text>')


def tw(s, size):
    """Approximate rendered text width."""
    return sum(size * (0.6 if ord(ch) < 128 else 1.0) for ch in s)


def defs():
    out = ['<defs>']
    for name, op in (("sh-light", 0.16), ("sh-dark", 0.45), ("sh-drag", 0.32)):
        dy, sd = (16, 16) if name == "sh-drag" else (8, 12)
        out.append(f'<filter id="{name}" x="-40%" y="-120%" width="180%" height="360%">'
                   f'<feDropShadow dx="0" dy="{dy}" stdDeviation="{sd}" flood-color="#0F1115" flood-opacity="{op}"/></filter>')
    out.append('<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
               f'<path d="M0 0 L10 5 L0 10 z" fill="{ANNOT}"/></marker>')
    out.append('</defs>')
    return "".join(out)


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{defs()}{body}</svg>')


def callout(x1, y1, x2, y2, s, anchor="start"):
    dx = 6 if anchor == "start" else -6
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{ANNOT}" stroke-width="1.3" stroke-dasharray="4 3"/>'
            f'<circle cx="{x1}" cy="{y1}" r="3" fill="{ANNOT}"/>' + txt(x2 + dx, y2 + 4, s, 12.5, ANNOT, anchor=anchor))


# ---------------------------------------------------------------- page

def page(w, h, mode="light", side_w=280, title="编写插件设计文档"):
    p = PAGE[mode]
    s = [f'<rect width="{w}" height="{h}" fill="{p["bg"]}"/>',
         f'<rect width="{side_w}" height="{h}" fill="{p["side"]}"/>',
         f'<line x1="{side_w}" y1="0" x2="{side_w}" y2="{h}" stroke="{p["line"]}"/>',
         '<circle cx="34" cy="30" r="11" fill="#4D6BFE"/>',
         txt(54, 35, "DeepSeek Harness", 15, p["fg"], 600),
         f'<rect x="16" y="60" width="{side_w-32}" height="34" rx="8" fill="{p["bg"]}" stroke="{p["line"]}"/>',
         txt(40, 82, "＋ 新建会话", 13, p["fg"])]
    y = 124
    for g, items in (("dsh-session-float", ["重构登录模块", "编写插件设计文档"]),
                     ("my-api", ["修复 CI 失败用例", "接口限流方案"]),
                     ("data-pipeline", ["分析日志性能瓶颈", "清理旧任务"])):
        if y > h - 80:
            break
        s.append(txt(20, y, f"▾ {g}", 12, p["fg3"]))
        y += 26
        for it in items:
            if y > h - 20:
                break
            s.append(txt(36, y, it, 13, p["fg2"]))
            y += 28
        y += 10
    if h > 400:
        s.append(txt(20, h - 24, "⚙ 设置", 13, p["fg2"]))
    cx = side_w + 32
    s += [txt(cx, 36, title, 15, p["fg"], 600),
          f'<line x1="{side_w}" y1="58" x2="{w}" y2="58" stroke="{p["line"]}"/>',
          f'<rect x="{w-480}" y="96" width="420" height="52" rx="14" fill="{p["bubble"]}"/>',
          txt(w - 460, 127, "请分析需求并设计初步方案和效果图。", 13, p["fg2"])]
    for i, bw in enumerate((0.62, 0.56, 0.6, 0.38)):
        s.append(f'<rect x="{cx+28}" y="{186+i*28}" width="{(w-side_w-120)*bw}" height="14" rx="4" fill="{p["skel"]}"/>')
    if h > 420:
        s += [f'<rect x="{cx+28}" y="{h-116}" width="{w-side_w-120}" height="80" rx="16" fill="{p["input"]}" stroke="{p["input_border"]}"/>',
              txt(cx + 52, h - 80, "给 DeepSeek 发送消息…", 13, p["fg3"])]
    return "\n".join(s)


# ---------------------------------------------------------------- glyphs

def glyph(kind, cx, cy, mode, r=6):
    """Detailed-mode status logo (also used in panel rows)."""
    c = STATUS[mode][kind]
    bg = ISL[mode]["bg"]
    if kind == "pending":
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>'
                f'<rect x="{cx-1}" y="{cy-r*0.6}" width="2" height="{r*0.7}" rx="1" fill="{bg}"/>'
                f'<circle cx="{cx}" cy="{cy+r*0.42}" r="{r*0.18}" fill="{bg}"/>')
    if kind == "completed":
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>'
                f'<path d="M{cx-r*0.5} {cy} l{r*0.35} {r*0.37} l{r*0.65} {-r*0.7}" stroke="{bg}" stroke-width="{max(1.5, r*0.28)}" '
                'fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    rr = r - 1
    return (f'<circle cx="{cx}" cy="{cy}" r="{rr}" stroke="{c}" stroke-opacity="0.28" stroke-width="2" fill="none"/>'
            f'<path d="M{cx} {cy-rr} A{rr} {rr} 0 0 1 {cx+rr} {cy}" stroke="{c}" stroke-width="2" fill="none" stroke-linecap="round"/>')


def activity_dot(cx, cy, mode):
    b = ISL[mode]["brand"]
    return (f'<circle cx="{cx}" cy="{cy}" r="7" fill="none" stroke="{b}" stroke-opacity="0.22" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="{cy}" r="3.6" fill="{b}"/>')


def badge(kind, cx, cy, n, mode, r=11):
    """Compact-mode logo with the number in its center."""
    t = ISL[mode]
    label = "99+" if n > 99 else str(n)
    fs = 11 if len(label) < 3 else 8.5
    if kind == "total":
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{t["brand"]}"/>'
                + txt(cx, cy + fs * 0.36, label, fs, t["brand_fg"], 700, "middle"))
    c = STATUS[mode][kind]
    if kind == "running":
        rr = r - 1.2
        return (f'<circle cx="{cx}" cy="{cy}" r="{rr}" stroke="{c}" stroke-opacity="0.25" stroke-width="2.2" fill="none"/>'
                f'<path d="M{cx} {cy-rr} A{rr} {rr} 0 0 1 {cx+rr} {cy}" stroke="{c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
                + txt(cx, cy + fs * 0.36, label, fs, c, 700, "middle"))
    s = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>' + txt(cx, cy + fs * 0.36, label, fs, "#FFFFFF", 700, "middle")
    if kind == "completed":  # small check chip keeps it distinguishable from pending without color
        s += (f'<circle cx="{cx+r*0.78}" cy="{cy+r*0.78}" r="4.6" fill="{t["bg"]}"/>'
              f'<circle cx="{cx+r*0.78}" cy="{cy+r*0.78}" r="3.6" fill="{c}"/>'
              f'<path d="M{cx+r*0.78-1.7} {cy+r*0.78} l1.1 1.1 l2.1 -2.2" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round"/>')
    else:  # pending: small "!" chip
        s += (f'<circle cx="{cx+r*0.78}" cy="{cy-r*0.78}" r="4.6" fill="{t["bg"]}"/>'
              f'<circle cx="{cx+r*0.78}" cy="{cy-r*0.78}" r="3.6" fill="{c}"/>'
              f'<rect x="{cx+r*0.78-0.55}" y="{cy-r*0.78-2.3}" width="1.1" height="2.6" rx="0.5" fill="#fff"/>'
              f'<circle cx="{cx+r*0.78}" cy="{cy-r*0.78+1.6}" r="0.6" fill="#fff"/>')
    return s


# ---------------------------------------------------------------- collapsed island

def segments(counts):
    return [(k, n) for k, n in zip(("pending", "completed", "running"), counts) if n > 0]


def pill(x, y, counts, mode="light", style="detailed", anchor="left", drag=False, scale=1.0, opacity=1.0):
    """Collapsed island. `x` is the left edge for anchor=left, the right edge for anchor=right."""
    t = ISL[mode]
    total = sum(counts)
    segs = segments(counts)
    parts = []
    if style == "detailed":
        cur = 14
        parts.append(activity_dot(cur + 6, 18, mode))
        cur += 18
        parts.append(txt(cur, 23, str(total), 14, t["fg"], 700))
        cur += tw(str(total), 14) + 4
        parts.append(txt(cur, 22.5, "活动", 12.5, t["fg2"]))
        cur += tw("活动", 12.5)
        if segs:
            cur += 11
            parts.append(f'<line x1="{cur}" y1="11" x2="{cur}" y2="25" stroke="{t["divider"]}" stroke-width="1.2"/>')
            cur += 11
        for i, (k, n) in enumerate(segs):
            parts.append(glyph(k, cur + 6, 18, mode))
            cur += 16
            parts.append(txt(cur, 23, str(n), 13.5, STATUS[mode][k], 700))
            cur += tw(str(n), 13.5) + 3
            parts.append(txt(cur, 22.5, LABEL[k], 12, t["fg2"]))
            cur += tw(LABEL[k], 12) + (12 if i < len(segs) - 1 else 0)
        w = cur + 14
    else:
        cur = 7
        parts.append(badge("total", cur + 11, 18, total, mode))
        cur += 22
        if segs:
            cur += 6
            parts.append(f'<line x1="{cur}" y1="11" x2="{cur}" y2="25" stroke="{t["divider"]}" stroke-width="1.2"/>')
            cur += 6
        for i, (k, n) in enumerate(segs):
            parts.append(badge(k, cur + 11, 18, n, mode))
            cur += 22 + (8 if i < len(segs) - 1 else 0)
        w = cur + 7
    left = x if anchor == "left" else x - w * scale
    filt = "sh-drag" if drag else f"sh-{mode}"
    g = (f'<g transform="translate({left} {y}) scale({scale})" opacity="{opacity}" filter="url(#{filt})">'
         f'<rect width="{w}" height="36" rx="18" fill="{t["bg"]}" stroke="{t["border"]}"/>' + "".join(parts) + '</g>')
    return g, w


# ---------------------------------------------------------------- expanded island

ROWS = {
    "pending": [("重构登录模块", "dsh-session-float", "等待审批 · bash: pnpm install", "2 分钟前", False)],
    "completed": [("修复 CI 失败用例", "my-api", "已完成，未查看", "刚刚", False)],
    "running": [("分析日志性能瓶颈", "data-pipeline", "运行中 · 2 个子代理", "5 分钟", False),
                ("编写插件设计文档", "dsh-session-float", "运行中 · 当前会话", "12 分钟", True)],
}
PW = 380


def gear(cx, cy, c):
    teeth = "".join(f'<rect x="{cx-1.3}" y="{cy-7.2}" width="2.6" height="3" rx="0.8" fill="{c}" transform="rotate({a} {cx} {cy})"/>'
                    for a in range(0, 360, 45))
    return teeth + f'<circle cx="{cx}" cy="{cy}" r="4.6" fill="none" stroke="{c}" stroke-width="1.8"/>'


def header_btn(cx, cy, mode, kind):
    t = ISL[mode]
    s = f'<circle cx="{cx}" cy="{cy}" r="13" fill="{t["chip"]}"/>'
    if kind == "gear":
        s += gear(cx, cy, t["fg2"])
    elif kind == "collapse":
        s += f'<path d="M{cx-5} {cy+2.5} l5 -5 l5 5" stroke="{t["fg2"]}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    elif kind == "back":
        s += f'<path d="M{cx+2.5} {cy-5} l-5 5 l5 5" stroke="{t["fg2"]}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    return s


def panel_list(mode, groups=("pending", "completed", "running"), hover_row=None, row_opacity=None):
    t = ISL[mode]
    total = sum(len(ROWS[g]) for g in groups)
    s = [f'<rect x="{PW/2-18}" y="7" width="36" height="4" rx="2" fill="{t["track"]}"/>',
         txt(20, 38, "活动会话", 15, t["fg"], 700),
         f'<rect x="92" y="23" width="26" height="20" rx="10" fill="{t["chip"]}"/>',
         txt(105, 38, str(total), 12.5, t["fg"], 700, "middle"),
         header_btn(PW - 58, 33, mode, "gear"), header_btn(PW - 26, 33, mode, "collapse")]
    cy, idx = 56, 0
    for g in groups:
        items = ROWS[g]
        color = STATUS[mode][g]
        s.append(txt(20, cy + 20, LABEL[g], 12, color, 600))
        s.append(txt(62, cy + 20, str(len(items)), 12, t["fg3"]))
        s.append(f'<line x1="78" y1="{cy+16}" x2="{PW-20}" y2="{cy+16}" stroke="{t["divider"]}"/>')
        cy += 30
        for title, ws, detail, when, current in items:
            op = 1 if row_opacity is None else row_opacity[idx] if idx < len(row_opacity) else 1
            dy = 0 if op == 1 else 6 * (1 - op)
            bg = t["hover"] if idx == hover_row else (t["current"] if current else "none")
            s.append(f'<g opacity="{op}" transform="translate(0 {dy})">')
            s.append(f'<rect x="8" y="{cy}" width="{PW-16}" height="54" rx="12" fill="{bg}"/>')
            if current:
                s.append(f'<rect x="8" y="{cy+14}" width="3" height="26" rx="1.5" fill="{STATUS[mode]["running"]}"/>')
            s.append(glyph(g, 30, cy + 20, mode, 7))
            s.append(txt(48, cy + 25, title, 14, t["fg"], 600))
            s.append(txt(48, cy + 44, f"{ws}  ·  {detail}", 11.5, t["fg3"]))
            s.append(txt(PW - 44, cy + 25, when, 11.5, t["fg3"], anchor="end"))
            arrow = t["fg"] if idx == hover_row else t["fg3"]
            s.append(f'<path d="M{PW-30} {cy+16} l5 5 l-5 5" stroke="{arrow}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
            s.append('</g>')
            cy += 58
            idx += 1
    s.append(f'<line x1="20" y1="{cy+4}" x2="{PW-20}" y2="{cy+4}" stroke="{t["divider"]}"/>')
    s.append(txt(20, cy + 28, "点击会话跳转 · 拖动顶部把手移动 · Esc 收起", 11.5, t["fg3"]))
    return "\n".join(s), cy + 44


def segmented(x, y, w, options, selected, t, icons=None, h=56):
    n = len(options)
    cw = (w - 8 - 6 * (n - 1)) / n
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{t["chip"]}"/>']
    for i, o in enumerate(options):
        cx = x + 4 + i * (cw + 6)
        if o == selected:
            s.append(f'<rect x="{cx}" y="{y+4}" width="{cw}" height="{h-8}" rx="9" fill="{t["bg"]}" stroke="{t["border"]}"/>')
        col = t["fg"] if o == selected else t["fg2"]
        if icons:
            s.append(icons[i](cx + cw / 2, y + h / 2 - 8, col))
            s.append(txt(cx + cw / 2, y + h / 2 + 15, o, 12, col, 600 if o == selected else 400, "middle"))
        else:
            s.append(txt(cx + cw / 2, y + h / 2 + 4, o, 12.5, col, 600 if o == selected else 400, "middle"))
    return "".join(s)


def sun(cx, cy, c):
    rays = "".join(f'<line x1="{cx}" y1="{cy-8.5}" x2="{cx}" y2="{cy-6.5}" stroke="{c}" stroke-width="1.5" stroke-linecap="round" transform="rotate({a} {cx} {cy})"/>'
                   for a in range(0, 360, 45))
    return rays + f'<circle cx="{cx}" cy="{cy}" r="4" fill="none" stroke="{c}" stroke-width="1.5"/>'


def moon(cx, cy, c):
    return f'<path d="M{cx+2} {cy-7} A7 7 0 1 0 {cx+7} {cy+3} A5.5 5.5 0 0 1 {cx+2} {cy-7} z" fill="none" stroke="{c}" stroke-width="1.5" stroke-linejoin="round"/>'


def system(cx, cy, c):
    return (f'<circle cx="{cx}" cy="{cy}" r="6.5" fill="none" stroke="{c}" stroke-width="1.5"/>'
            f'<path d="M{cx} {cy-6.5} A6.5 6.5 0 0 1 {cx} {cy+6.5} z" fill="{c}"/>')


def switch(x, y, on, t, accent):
    knob = x + 22 if on else x + 2
    return (f'<rect x="{x}" y="{y}" width="40" height="22" rx="11" fill="{accent if on else t["track"]}"/>'
            f'<circle cx="{knob+9}" cy="{y+11}" r="9" fill="#FFFFFF"/>')


def settings_form(x0, y0, w, t, mode, accent):
    """Shared settings form: rendered inside the island and inside the DSH settings tab."""
    s = []
    y = y0
    s.append(txt(x0, y + 14, "外观", 13, t["fg"], 600))
    s.append(txt(x0, y + 32, "只影响灵动岛；「系统」跟随 DSH 当前主题", 11.5, t["fg3"]))
    s.append(segmented(x0, y + 42, w, ["浅色", "深色", "系统"], "系统", t, [sun, moon, system]))
    y += 116
    s.append(txt(x0, y + 14, "收纳状态", 13, t["fg"], 600))
    s.append(txt(x0, y + 32, "收起时胶囊的信息详略", 11.5, t["fg3"]))
    cw = (w - 10) / 2
    for i, (name, sel) in enumerate((("简略", False), ("详细", True))):
        cx = x0 + i * (cw + 10)
        s.append(f'<rect x="{cx}" y="{y+42}" width="{cw}" height="74" rx="12" fill="{t["chip"] if not sel else t["bg"]}" '
                 f'stroke="{accent if sel else t["border"]}" stroke-width="{1.6 if sel else 1}"/>')
        s.append(txt(cx + 12, y + 106, name, 12.5, t["fg"], 600 if sel else 400))
        s.append(f'<circle cx="{cx+cw-16}" cy="{y+102}" r="6" fill="{accent if sel else "none"}" stroke="{accent if sel else t["fg3"]}" stroke-width="1.4"/>')
        if sel:
            s.append(f'<circle cx="{cx+cw-16}" cy="{y+102}" r="2.3" fill="#fff"/>')
        g, pw_ = pill(0, 0, (1, 1, 2), mode, "compact" if name == "简略" else "detailed")
        sc = min(0.72, (cw - 24) / pw_)
        s.append(f'<g transform="translate({cx+12} {y+52+(36-36*sc)/2}) scale({sc})">{g}</g>')
    y += 134
    s.append(f'<line x1="{x0}" y1="{y}" x2="{x0+w}" y2="{y}" stroke="{t["divider"]}"/>')
    s.append(txt(x0, y + 30, "点击空白处收起", 13, t["fg"], 600))
    s.append(txt(x0, y + 48, "点击灵动岛以外的区域时回到收纳状态", 11.5, t["fg3"]))
    s.append(switch(x0 + w - 40, y + 20, True, t, accent))
    y += 64
    s.append(f'<line x1="{x0}" y1="{y}" x2="{x0+w}" y2="{y}" stroke="{t["divider"]}"/>')
    s.append(txt(x0, y + 30, "位置", 13, t["fg"], 600))
    s.append(txt(x0, y + 48, "当前：左上角，偏移 16, 12", 11.5, t["fg3"]))
    s.append(f'<rect x="{x0+w-96}" y="{y+18}" width="96" height="28" rx="8" fill="none" stroke="{t["border"]}"/>')
    s.append(txt(x0 + w - 48, y + 37, "恢复默认", 12, t["fg"], anchor="middle"))
    y += 64
    s.append(f'<line x1="{x0}" y1="{y}" x2="{x0+w}" y2="{y}" stroke="{t["divider"]}"/>')
    s.append(txt(x0, y + 26, "更多设置即将推出", 11.5, t["fg3"]))
    return "\n".join(s), y + 40 - y0


def panel_settings(mode):
    t = ISL[mode]
    s = [f'<rect x="{PW/2-18}" y="7" width="36" height="4" rx="2" fill="{t["track"]}"/>',
         header_btn(26, 33, mode, "back"),
         txt(48, 38, "灵动岛设置", 15, t["fg"], 700),
         header_btn(PW - 26, 33, mode, "collapse")]
    form, h = settings_form(20, 62, PW - 40, t, mode, STATUS[mode]["running"])
    s.append(form)
    return "\n".join(s), 62 + h + 4


def panel(x, y, mode="light", view="list", anchor="left", **kw):
    t = ISL[mode]
    body, h = panel_list(mode, **kw) if view == "list" else panel_settings(mode)
    left = x if anchor == "left" else x - PW
    return (f'<g transform="translate({left} {y})" filter="url(#sh-{mode})">'
            f'<rect width="{PW}" height="{h}" rx="22" fill="{t["bg"]}" stroke="{t["border"]}"/>{body}</g>'), h


# ================================================================ 01 collapsed
p, pw = pill(16, 12, (1, 1, 2))
b = page(1280, 800) + p
b += callout(pw + 6, 48, 470, 120, "单击展开；按住拖动可移动")
b += callout(200, 48, 470, 150, "各状态：图标 + 数字 + 文字；数量为 0 的状态不显示")
b += callout(70, 48, 470, 180, "活动总数：DSH 主题色（浅色岛为黑色）")
(OUT / "01-collapsed.svg").write_text(svg(1280, 800, b))

# ================================================================ 02 expanded
pn, ph = panel(16, 12, hover_row=1)
b = page(1280, 800) + pn
b += callout(396, 86, 480, 86, "分组顺序固定：待处理 → 已完成 → 进行中；空组不显示")
b += callout(396, 214, 480, 214, "悬停高亮，单击跳转到该会话并收起")
b += callout(396, 330, 480, 330, "当前打开的会话带竖条标记")
b += callout(334, 33, 480, 46, "设置入口（齿轮）/ 收起")
b += callout(16, ph + 20, 480, ph + 40, "锚定在左侧：从左上角向右下展开，收起时缩回左上角")
(OUT / "02-expanded.svg").write_text(svg(1280, 800, b))

# ================================================================ 03 collapsed variants
W, H = 1280, 560
parts = [f'<rect width="{W}" height="{H}" fill="#F2F3F5"/>', txt(40, 46, "收纳状态：详细 / 简略", 20, "#0F1115", 700),
         txt(40, 70, "只显示数量大于 0 的状态；活动总数始终显示。左列浅色岛，右列深色岛。", 12.5, "#61666B")]
cases = [((1, 1, 2), "全部状态都有"), ((0, 1, 2), "无待处理：不显示待处理"), ((3, 0, 0), "只有待处理"),
         ((0, 0, 0), "无活动会话：只显示 0（降低不透明度）"), ((2, 5, 128), "大数：简略态 >99 显示 99+")]
col_x = {"light": 40, "dark": 660}
for mode in ("light", "dark"):
    x0 = col_x[mode]
    parts.append(f'<rect x="{x0}" y="90" width="580" height="{H-120}" rx="16" fill="{"#FFFFFF" if mode == "light" else "#232324"}" stroke="#E2E3E6"/>')
    parts.append(txt(x0 + 20, 120, "浅色" if mode == "light" else "深色", 13, "#0F1115" if mode == "light" else "#F9FAFB", 700))
    parts.append(txt(x0 + 236, 120, "详细", 12, "#9A9EA4"))
    parts.append(txt(x0 + 380, 120, "简略", 12, "#9A9EA4"))
    for i, (cnt, desc) in enumerate(cases):
        y = 140 + i * 78
        parts.append(txt(x0 + 20, y + 24, desc, 11.5, "#9A9EA4" if mode == "dark" else "#61666B"))
        op = 0.6 if sum(cnt) == 0 else 1
        g, _ = pill(x0 + 20, y + 32, cnt, mode, "detailed", opacity=op)
        parts.append(g)
        g, _ = pill(x0 + 380, y + 32, cnt, mode, "compact", opacity=op)
        parts.append(g)
(OUT / "03-collapsed-variants.svg").write_text(svg(W, H, "\n".join(parts)))

# ================================================================ 04 appearance
W, H = 1280, 720
parts = [f'<rect width="{W}" height="{H}" fill="#F2F3F5"/>', txt(40, 46, "外观：浅色 / 深色 / 系统", 20, "#0F1115", 700),
         txt(40, 70, "「系统」跟随 DSH 当前主题（不是直接读操作系统）。深色岛比 DSH 深色背景（#151517 / #232324）亮一级，用来和页面区分。", 12.5, "#61666B")]


def crop(x, y, w, h, page_mode, island_mode, label="", sub="", expanded=False):
    """Page thumbnail whose frame starts at y (+40 when a label is drawn above it)."""
    fy = y + 40 if label else y
    out = [f'<svg x="{x}" y="{fy}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           page(w, h, page_mode, side_w=150)]
    if expanded:
        g, _ = panel(16, 12, island_mode, groups=("pending", "running"))
        out.append(f'<g transform="scale(0.78)">{g}</g>')
    else:
        g, _ = pill(16, 12, (1, 1, 2), island_mode)
        out.append(g)
    out.append('</svg>')
    out.append(f'<rect x="{x}" y="{fy}" width="{w}" height="{h}" fill="none" stroke="#D6D8DC" rx="6"/>')
    if label:
        out.append(txt(x, y + 16, label, 14, "#0F1115", 700))
        out.append(txt(x, y + 33, sub, 11.5, "#61666B"))
    return "".join(out)


cw, ch = 380, 290
parts.append(crop(40, 90, cw, ch, "light", "light", "浅色", "白底、细描边、柔和阴影", True))
parts.append(crop(450, 90, cw, ch, "light", "dark", "深色（在浅色 DSH 中）", "岛体 #3A3B40，强对比的灵动岛风格", True))
parts.append(crop(860, 90, cw, ch, "dark", "dark", "深色（在深色 DSH 中）", "比 DSH 深色亮一级，仍能看出边界", True))
parts.append(txt(40, 456, "系统：跟随 DSH 主题", 14, "#0F1115", 700))
parts.append(txt(40, 474, "监听 ctx.theme 的 theme/change 事件；DSH 切换主题时灵动岛同步切换（150ms 颜色过渡）", 11.5, "#61666B"))
parts.append(crop(40, 494, 560, 180, "light", "light"))
parts.append(crop(680, 494, 560, 180, "dark", "dark"))
parts.append(txt(40, 696, "DSH 浅色 → 浅色岛", 12, "#61666B"))
parts.append(txt(680, 696, "DSH 深色 → 深色岛", 12, "#61666B"))
parts.append(f'<path d="M610 584 L670 584" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>')
(OUT / "04-appearance.svg").write_text(svg(W, H, "\n".join(parts)))

# ================================================================ 05 direction
W, H = 1280, 760


def corner_mark(x, y, sx, sy, label, anchor):
    """L-shaped anchor marker at a fixed corner; sx/sy point into the panel."""
    return (f'<path d="M{x} {y+sy*22} L{x} {y} L{x+sx*22} {y}" stroke="{ANNOT}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
            f'<circle cx="{x}" cy="{y}" r="4" fill="{ANNOT}"/>' + txt(x - sx * 8 if anchor == "end" and sx > 0 else x - 12, y - 10, label, 12, ANNOT, 600, "end"))


b = page(W, H)
b += f'<line x1="{W/2}" y1="0" x2="{W/2}" y2="{H}" stroke="{ANNOT}" stroke-dasharray="6 5" stroke-opacity="0.6"/>'
b += txt(W / 2 + 8, H - 14, "视口水平中线", 11.5, ANNOT)
# left half
LX, LY = 300, 96
g, h = panel(LX, LY, groups=("pending", "running"))
b += g
b += corner_mark(LX - 6, LY - 6, 1, 1, "固定角", "end")
b += f'<path d="M{LX+40} {LY-36} L{LX+PW-6} {LY-36}" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>'
b += f'<path d="M{LX-20} {LY+40} L{LX-20} {LY+h-6}" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>'
b += txt(LX, LY + h + 26, "在左半边：左上角固定，向右、向下展开；收起时缩回左上角", 12.5, ANNOT)
# right half
RX, RY = 1240, 96
g, h2 = panel(RX, RY, groups=("completed", "running"), anchor="right")
b += g
b += corner_mark(RX + 6, RY - 6, -1, 1, "固定角", "start")
b += f'<path d="M{RX-60} {RY-36} L{RX-PW+6} {RY-36}" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>'
b += f'<path d="M{RX+20} {RY+40} L{RX+20} {RY+h2-6}" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>'
b += txt(RX, RY + h2 + 26, "在右半边：右上角固定，向左、向下展开；收起时缩回右上角", 12.5, ANNOT, anchor="end")
# bottom-right collapsed
BY = H - 150
g, wb = pill(RX, BY, (0, 1, 2), anchor="right")
b += g
b += corner_mark(RX + 6, BY + 42, -1, -1, "", "start")
b += f'<path d="M{RX-wb/2} {BY-10} L{RX-wb/2} {BY-80}" stroke="{ANNOT}" stroke-width="1.6" marker-end="url(#arr)"/>'
b += txt(RX - wb / 2 - 10, BY - 40, "在下半边：右下角固定，面板向上展开", 12, ANNOT, anchor="end")
(OUT / "05-direction.svg").write_text(svg(W, H, b))

# ================================================================ 06 settings
W, H = 1280, 800
b = page(W, H)
# Replace the conversation with the Plugins page showing this bundle's detail.
SX = 280
b += f'<rect x="{SX+1}" y="0" width="{W-SX-1}" height="{H}" fill="#FFFFFF"/>'
b += f'<rect x="12" y="{H-92}" width="256" height="34" rx="8" fill="#ECEDF0"/>'
b += txt(36, H - 70, "⧉ 插件", 13, "#0F1115", 600)
mx = SX + 470
b += txt(mx, 44, "插件  ›  已安装  ›  dsh-session-float", 12, "#9A9EA4")
b += txt(mx, 82, "活动会话灵动岛", 20, "#0F1115", 700)
b += txt(mx, 104, "dsh-session-float · 0.1.0", 12, "#9A9EA4")
b += f'<rect x="{W-110}" y="64" width="40" height="22" rx="11" fill="#0F1115"/><circle cx="{W-79}" cy="75" r="9" fill="#fff"/>'
b += txt(mx, 136, "浮动显示活动会话的数量与详情，点击即可跳转。", 13, "#61666B")
b += f'<rect x="{mx-16}" y="180" width="{W-mx-24}" height="440" rx="16" fill="#F9FAFB" stroke="#ECEDF0"/>'
form, _ = settings_form(mx, 194, W - mx - 56, ISL["light"], "light", "#4176E6")
b += form
b += txt(mx, 648, "组件", 13, "#0F1115", 600)
b += f'<rect x="{mx-16}" y="660" width="{W-mx-24}" height="44" rx="12" fill="#FFFFFF" stroke="#ECEDF0"/>'
b += txt(mx, 687, "session-float", 13, "#0F1115") + txt(mx + 110, 687, "dsh-session-float", 12, "#9A9EA4")
b += f'<rect x="{W-110}" y="671" width="40" height="22" rx="11" fill="#0F1115"/><circle cx="{W-79}" cy="682" r="9" fill="#fff"/>'
# Island in its settings view.
g, h = panel(16, 12, view="settings")
b += g
b += callout(395, 60, mx - 30, 260, "岛内设置页（齿轮进入，箭头返回）", "end")
b += txt(mx - 16, 168, "↓ plugins.bundle.config：与岛内设置页渲染同一份表单", 12.5, ANNOT)
(OUT / "06-settings.svg").write_text(svg(W, H, b))

# ================================================================ 07 motion storyboard
W, H = 1280, 860
parts = [f'<rect width="{W}" height="{H}" fill="#F2F3F5"/>', txt(40, 46, "过渡动画（Motion 弹簧 + layout 动画）", 20, "#0F1115", 700),
         txt(40, 70, "容器先变形，内容后出现；收起时内容先消失，容器再收回。动画可被打断：展开中途再次点击会从当前状态平滑反向。", 12.5, "#61666B")]
FW, FH = 286, 210


def frame(i, row_y, label, sub, content):
    x = 40 + i * (FW + 18)
    return (f'<rect x="{x}" y="{row_y}" width="{FW}" height="{FH}" rx="12" fill="#FFFFFF" stroke="#E2E3E6"/>'
            f'<g transform="translate({x+14} {row_y+14})">{content}</g>'
            + txt(x, row_y + FH + 20, label, 12.5, "#0F1115", 700) + txt(x, row_y + FH + 38, sub, 11.5, "#61666B"))


def blob(w, h, r, content="", op=1):
    t = ISL["light"]
    return (f'<g filter="url(#sh-light)"><rect width="{w}" height="{h}" rx="{r}" fill="{t["bg"]}" stroke="{t["border"]}"/></g>'
            f'<g opacity="{op}">{content}</g>')


def rows_skel(n, w, start=46, op=None):
    t = ISL["light"]
    out = []
    for k in range(n):
        o = 1 if op is None else op[k]
        out.append(f'<g opacity="{o}" transform="translate(0 {(1-o)*6})"><circle cx="18" cy="{start+k*34+8}" r="6" fill="{STATUS["light"][("pending","completed","running","running")[k]]}"/>'
                   f'<rect x="32" y="{start+k*34+2}" width="{w*0.55}" height="8" rx="4" fill="{t["fg"]}" opacity="0.75"/>'
                   f'<rect x="32" y="{start+k*34+15}" width="{w*0.4}" height="6" rx="3" fill="{t["fg3"]}" opacity="0.6"/></g>')
    return "".join(out)


head = txt(14, 26, "活动会话", 12, ISL["light"]["fg"], 700)
g0, w0 = pill(0, 0, (1, 1, 2))
r1 = 96
parts.append(frame(0, r1, "0 ms · 按下", "胶囊轻微缩小到 0.97，给出按压反馈", f'<g transform="translate(2 4) scale(0.69)">{g0}</g>'))
parts.append(frame(1, r1, "0–120 ms · 内容淡出", "胶囊文字淡出并轻微模糊；容器开始拉伸",
                   blob(236, 70, 26, f'<g opacity="0.25" transform="translate(2 18) scale(0.69)">{g0}</g>')))
parts.append(frame(2, r1, "80–300 ms · 容器弹开", "宽、高、圆角一起做弹簧动画，略微回弹",
                   blob(262, 184, 22, head + rows_skel(4, 262, op=[0.9, 0.5, 0.15, 0]), 1)))
parts.append(frame(3, r1, "300–450 ms · 行依次进入", "列表行每行间隔 30ms 淡入并上移 6px",
                   blob(258, 180, 22, head + rows_skel(4, 258))))
r2 = 390
parts.append(frame(0, r2, "收起 0–100 ms", "列表内容快速淡出（比展开更快）", blob(258, 180, 22, head + rows_skel(4, 258, op=[0.3, 0.3, 0.3, 0.3]))))
parts.append(frame(1, r2, "80–320 ms · 容器收回", "朝锚定角收拢（左侧岛向左上角收）", blob(170, 90, 28)))
parts.append(frame(2, r2, "260–380 ms · 胶囊内容淡入", "数字与图标淡入，回到收纳态", f'<g transform="translate(2 4) scale(0.69)">{g0}</g>'))
gA, _ = pill(0, 0, (1, 1, 2))
gB, _ = pill(0, 0, (0, 1, 2))
cnt = (f'<g transform="translate(2 4) scale(0.69)">{gA}</g>'
       f'<g transform="translate(2 74) scale(0.69)">{gB}</g>'
       f'<path d="M120 52 L120 70" stroke="{ANNOT}" stroke-width="1.4" marker-end="url(#arr)"/>'
       + txt(2, 140, "待处理清零：该段缩宽并淡出，", 11, "#61666B") + txt(2, 156, "胶囊宽度跟着平滑变化", 11, "#61666B")
       + txt(2, 172, "数字变化：旧数字上移淡出，", 11, "#61666B") + txt(2, 188, "新数字从下方进入", 11, "#61666B"))
parts.append(frame(3, r2, "计数变化", "数量变化用 layout 动画，不跳动", cnt))
parts.append(txt(40, 700, "参数（初值，实现时调）", 13, "#0F1115", 700))
for k, line in enumerate([
        "容器：spring { stiffness: 420, damping: 34, mass: 0.9 }，约 400ms 稳定；圆角 18 → 22",
        "内容：opacity + filter: blur(4px) + scale(0.96)，进入 180ms、离开 100ms，ease-out",
        "列表行：staggerChildren 0.03，y 6 → 0；新待处理到达：scale 1 → 1.06 → 1（260ms）",
        "prefers-reduced-motion：关闭位移和缩放，只保留 120ms 淡入淡出"]):
    parts.append(txt(40, 726 + k * 24, "· " + line, 12.5, "#3A3C40"))
(OUT / "07-motion.svg").write_text(svg(W, H, "\n".join(parts)))
print("ok")
