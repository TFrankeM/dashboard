"""Generate the DB schema and site architecture diagrams (PNG) with matplotlib."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

INK = "#0f172a"; MUTE = "#475569"
BLUE_H = "#1e3a8a"; BLUE_L = "#3b82f6"; DIM_H = "#0c63aa"
TEAL_H = "#0f766e"; GRAY = "#94a3b8"; TEAL = "#0d9488"

ROW_H, HEAD_H, PADX = 0.34, 0.52, 0.16

def table(ax, left, top, w, name, cols, header=BLUE_H, sub=None):
    """cols: list of (text, kind) kind in {pk, fk, dim}. Returns edge anchors."""
    n = len(cols)
    h = HEAD_H + n * ROW_H + 0.12
    bottom = top - h
    ax.add_patch(FancyBboxPatch((left, bottom), w, h, boxstyle="round,pad=0.02,rounding_size=0.10",
                                linewidth=1.2, edgecolor="#cbd5e1", facecolor="white", zorder=3))
    ax.add_patch(FancyBboxPatch((left, top - HEAD_H), w, HEAD_H, boxstyle="round,pad=0.02,rounding_size=0.10",
                                linewidth=0, facecolor=header, zorder=4))
    ax.text(left + w / 2, top - HEAD_H / 2, name, color="white", fontsize=10.5, fontweight="bold",
            ha="center", va="center", zorder=5, family="DejaVu Sans")
    if sub:
        ax.text(left + w / 2, top - HEAD_H + 0.02, sub, color="#e2e8f0", fontsize=6.5,
                ha="center", va="top", zorder=5, style="italic")
    for i, (txt, kind) in enumerate(cols):
        y = top - HEAD_H - 0.06 - (i + 0.5) * ROW_H
        weight = "bold" if kind == "pk" else "normal"
        color = BLUE_L if kind == "fk" else (INK if kind == "pk" else MUTE)
        mark = "◆ " if kind == "pk" else ("→ " if kind == "fk" else "")
        ax.text(left + PADX, y, mark + txt, color=color, fontsize=8.4, ha="left", va="center",
                zorder=5, family="DejaVu Sans Mono", fontweight=weight)
    return dict(l=left, r=left + w, t=top, b=bottom, cx=left + w / 2, cy=(top + bottom) / 2)

def fk(ax, a, b, color=GRAY, dashed=False, label=None, rad=0.0):
    style = "--" if dashed else "-"
    arr = FancyArrowPatch((a[0], a[1]), (b[0], b[1]), arrowstyle="-|>", mutation_scale=13,
                          linewidth=1.4, color=color, linestyle=style,
                          connectionstyle=f"arc3,rad={rad}", zorder=2)
    ax.add_patch(arr)
    if label:
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        ax.text(mx, my + 0.12, label, fontsize=7, color=color, ha="center", va="bottom",
                style="italic", zorder=6, bbox=dict(boxstyle="round,pad=0.1", fc="white", ec="none", alpha=0.85))

# ============================================================ DB SCHEMA
fig, ax = plt.subplots(figsize=(15.5, 10.5))
ax.set_xlim(0, 15.5); ax.set_ylim(0, 10.5); ax.axis("off")
ax.text(0.3, 10.2, "Banco de dados IIBEx — modelo entidade-relacionamento (3FN) + tabelas derivadas",
        fontsize=13.5, fontweight="bold", color=INK)

# dimension tables (left)
category = table(ax, 0.4, 9.4, 3.1, "category", [("id", "pk"), ("slug", "dim")], DIM_H)
source   = table(ax, 0.4, 7.7, 3.1, "source", [("id", "pk"), ("name", "dim")], DIM_H)
language = table(ax, 0.4, 6.0, 3.1, "language", [("id", "pk"), ("iso_code", "dim")], DIM_H)
entity   = table(ax, 0.4, 4.3, 3.1, "target_entity", [("id", "pk"), ("slug", "dim"), ("type", "dim")], DIM_H)

# fact tables (middle)
news = table(ax, 5.0, 9.7, 4.0, "news_article", [
    ("id", "pk"), ("publication_date", "dim"), ("headline", "dim"), ("summary", "dim"),
    ("article_text", "dim"), ("url  (unique)", "dim"),
    ("source_id", "fk"), ("category_id", "fk"), ("language_id", "fk")], BLUE_H)
analysis = table(ax, 5.0, 4.2, 4.0, "analysis", [
    ("id", "pk"), ("grade", "dim"), ("analysis_text", "dim"),
    ("news_id", "fk"), ("evaluator_id", "fk"), ("evaluated_id", "fk")], BLUE_H)

# derived (right)
rollup = table(ax, 10.7, 10.0, 4.4, "rollup_hourly", [
    ("bucket  (hora)", "dim"), ("evaluator_id, evaluated_id", "dim"), ("category_id", "dim"),
    ("news_count, grade_sum", "dim"), ("grade_count", "dim"), ("g1 … g7  (histograma)", "dim")],
    TEAL_H, sub="derivada · pré-agregação")
mv = table(ax, 10.7, 5.6, 4.4, "target_entities_relationships", [
    ("evaluator_id", "dim"), ("evaluated_id", "dim")], TEAL_H, sub="materialized view")
stats = table(ax, 10.7, 3.5, 4.4, "site_stats", [
    ("total_news, total_analyses", "dim"), ("total_sources, _languages, _categories", "dim"),
    ("avg_grade_brasil, top_language", "dim"), ("last_date, computed_at", "dim")],
    TEAL_H, sub="derivada · 1 linha (cards)")

# FK edges
fk(ax, (news["l"], news["t"] - 1.4), (category["r"], category["cy"]), label="source_id / category_id / language_id", rad=0.1)
fk(ax, (news["l"], news["t"] - 2.0), (source["r"], source["cy"]), rad=0.1)
fk(ax, (news["l"], news["t"] - 2.6), (language["r"], language["cy"]), rad=0.1)
fk(ax, (analysis["cx"], analysis["t"]), (news["cx"], news["b"]), label="news_id", rad=0.0)
fk(ax, (analysis["l"], analysis["cy"]), (entity["r"], entity["cy"]), label="evaluator_id / evaluated_id", rad=0.0)

# derived edges (dashed, teal)
fk(ax, (news["r"], news["cy"] - 0.5), (rollup["l"], rollup["cy"]), TEAL, True, "pré-agrega por hora", rad=-0.15)
fk(ax, (analysis["r"], analysis["cy"]), (mv["l"], mv["b"] + 0.3), TEAL, True, "DISTINCT pares", rad=-0.2)
fk(ax, (analysis["r"], analysis["b"] + 0.3), (stats["l"], stats["cy"]), TEAL, True, "totais globais", rad=-0.25)

ax.text(0.3, 0.35, "◆ chave primária    → chave estrangeira    — FK    ··· derivado de (recalculado na ingestão)",
        fontsize=8.5, color=MUTE)
plt.tight_layout()
plt.savefig("docs/db_schema.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close()
print("docs/db_schema.png ok")

# ============================================================ ARCHITECTURE
def box(ax, x, y, w, h, title, lines, fc, ec, tc="white", fs=9, title_fs=10):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.03,rounding_size=0.12",
                                linewidth=1.6, edgecolor=ec, facecolor=fc, zorder=3))
    ax.text(x + w / 2, y + h - 0.30, title, ha="center", va="top", fontsize=title_fs,
            fontweight="bold", color=tc, zorder=5)
    for i, ln in enumerate(lines):
        ax.text(x + 0.18, y + h - 0.72 - i * 0.34, ln, ha="left", va="top", fontsize=fs,
                color=tc, zorder=5, family="DejaVu Sans")

def arrow(ax, a, b, color="#334155", label=None, rad=0.0, lw=2.0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=16, linewidth=lw,
                                 color=color, connectionstyle=f"arc3,rad={rad}", zorder=2))
    if label:
        ax.text((a[0]+b[0])/2, (a[1]+b[1])/2 + 0.1, label, fontsize=7.5, color=color,
                ha="center", style="italic", bbox=dict(boxstyle="round,pad=0.1", fc="white", ec="none", alpha=0.8))

fig, ax = plt.subplots(figsize=(15.5, 10.5))
ax.set_xlim(0, 15.5); ax.set_ylim(0, 10.5); ax.axis("off")
ax.text(0.3, 10.2, "Arquitetura do site IIBEx — do Excel ao navegador", fontsize=13.5, fontweight="bold", color=INK)

# ETL (top-left)
box(ax, 0.4, 8.5, 2.6, 1.3, "Excel (.xlsx)", ["852k linhas", "planilha única"], "#fef3c7", "#d97706", INK)
box(ax, 3.5, 8.3, 3.6, 1.7, "etl/ingest_to_neon.py", ["leitura streaming", "normalização 3FN + limpeza",
    "COPY em lotes", "constrói rollup + site_stats"], "#e0e7ff", "#4f46e5", INK, fs=8.3)

# DB (middle band)
box(ax, 0.4, 5.3, 6.7, 2.4, "Neon · PostgreSQL", [], "#ecfdf5", "#0f766e", INK, title_fs=11)
box(ax, 0.7, 5.55, 3.0, 1.5, "tabelas ER", ["news_article, analysis,", "category, source,", "language, target_entity"],
    "white", "#94a3b8", INK, fs=8)
box(ax, 3.9, 6.35, 3.0, 0.7, "rollup_hourly", ["pré-agregação (hora)"], "#ccfbf1", "#0d9488", INK, fs=8, title_fs=9)
box(ax, 3.9, 5.55, 1.45, 0.7, "site_stats", ["cards"], "#ccfbf1", "#0d9488", INK, fs=8, title_fs=9)
box(ax, 5.45, 5.55, 1.45, 0.7, "MV rel.", ["pares"], "#ccfbf1", "#0d9488", INK, fs=8, title_fs=9)

# API (middle-right)
box(ax, 8.0, 5.0, 7.0, 3.2, "api/data.js  ·  função serverless (Vercel)", [
    "widget=grade / volume / gauge / line   →  rollup_hourly  (fallback: cru)",
    "widget=details                         →  tabelas ER (lista de notícias)",
    "widget=relationships                   →  materialized view",
    "widget=stats                           →  site_stats",
    "",
    "cap de pontos (≤ 1500)   ·   cache CDN s-maxage=3600"],
    "#eff6ff", "#1e3a8a", INK, fs=8.6, title_fs=10.5)

# Frontend (bottom)
box(ax, 0.4, 1.0, 4.5, 2.8, "index.html  (landing)", [
    "js/index.js", "• globo 3D (pontos + radar)", "• cards ← widget=stats",
    "• “Acessar sala de situação”"], "#f8fafc", "#334155", INK, fs=8.5)
box(ax, 5.2, 1.0, 5.4, 2.8, "dashboard.html  (sala de situação)", [
    "js/dashboard.js + charts.js + api_adapter.js", "• histograma, volume, medidor, evolução",
    "• filtros (avaliador/avaliado/categoria/período)", "• gaveta lateral ← widget=details",
    "  (clique num ponto → notícias)"], "#f8fafc", "#334155", INK, fs=8.5)
box(ax, 10.9, 1.0, 4.2, 2.8, "details.html  (tabela)", [
    "js/details.js", "• lista completa de notícias", "• filtros, colunas, paginação",
    "• ← widget=details"], "#f8fafc", "#334155", INK, fs=8.5)

# arrows
arrow(ax, (3.0, 9.15), (3.5, 9.15), "#d97706")
arrow(ax, (5.3, 8.3), (4.0, 7.05), "#4f46e5", "grava", rad=0.1)
arrow(ax, (7.1, 6.2), (8.0, 6.4), "#0f766e", "lê", rad=0.0, lw=2.4)
arrow(ax, (2.6, 3.8), (9.5, 4.98), "#1e3a8a", rad=-0.12)   # index -> api
arrow(ax, (8.0, 3.8), (10.5, 4.98), "#1e3a8a", rad=-0.05)  # dashboard -> api
arrow(ax, (12.8, 3.8), (12.5, 4.98), "#1e3a8a", rad=0.05)  # details -> api
ax.text(7.6, 4.4, "HTTP  /api/data?widget=…", fontsize=8, color="#1e3a8a", style="italic", ha="center")

plt.tight_layout()
plt.savefig("docs/site_architecture.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close()
print("docs/site_architecture.png ok")
