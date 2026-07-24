import { createPool } from "@vercel/postgres";

const sql = createPool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

const toArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Filters accept both the category slug and its readable name.
const CATEGORY_MAP = {
    artes_cultura_entretenimento_midia: "Artes, cultura, entretenimento e mídia",
    ciencia_tecnologia: "Ciência e tecnologia",
    conflito_guerra_paz: "Conflito, guerra e paz",
    crime_lei_justica: "Crime, lei e justiça",
    desastres_acidentes_emergencias: "Desastres, acidentes e emergências",
    economia_negocios_financas: "Economia, negócios e finanças",
    educacao: "Educação",
    esporte: "Esporte",
    estilo_vida_lazer: "Estilo de vida e lazer",
    interesse_humano: "Interesse humano",
    meio_ambiente: "Meio ambiente",
    meteorologia: "Meteorologia",
    nao_informado: "Não informado",
    outros: "Outros",
    politica: "Política",
    religiao_crencas: "Religião e crenças",
    saude: "Saúde",
    sociedade: "Sociedade",
    trabalho: "Trabalho",
};
const catValues = cats => cats.flatMap(c => (CATEGORY_MAP[c] ? [c, CATEGORY_MAP[c]] : [c]));

// Falls back to live aggregation when the rollup table is absent.
let _rollupReady;
async function rollupReady() {
    if (_rollupReady === undefined) {
        try {
            const { rows } = await sql.query("SELECT to_regclass('public.rollup_hourly') IS NOT NULL AS ok");
            _rollupReady = rows[0].ok;
        } catch { _rollupReady = false; }
    }
    return _rollupReady;
}

// Schema detection: with the news_category table, news<->category is N:N and the
// rollup rows with category_id IS NULL hold the per-news deduplicated totals;
// without it, each news has a single news_article.category_id.
let _hasNewsCategory;
async function hasNewsCategory() {
    if (_hasNewsCategory === undefined) {
        try {
            const { rows } = await sql.query("SELECT to_regclass('public.news_category') IS NOT NULL AS ok");
            _hasNewsCategory = rows[0].ok;
        } catch { _hasNewsCategory = false; }
    }
    return _hasNewsCategory;
}

// Honor the requested aggregation exactly (no point cap). The hourly rollup serves
// whole-hour intervals; finer (sub-hour) falls back to the raw table.
function planTimeBin(query) {
    let req = parseFloat(query.aggregation);
    if (isNaN(req) || req <= 0) req = 1;
    const hasRange = !!(query.startDate && query.endDate);
    if (hasRange && req >= 1) return { useRollup: true, intervalHours: Math.max(1, Math.round(req)) };
    return { useRollup: false, intervalHours: req };
}

// ROLLUP path (fast): reads the pre-aggregated rollup_hourly table
function rollupBase(query) {
    const params = [];
    const conds = [];
    let from = `FROM rollup_hourly r
        JOIN target_entity ev ON r.evaluator_id = ev.id
        JOIN target_entity ed ON r.evaluated_id = ed.id`;

    const evaluators = toArray(query.evaluator);
    if (evaluators.length && !evaluators.includes("include_all")) {
        params.push(evaluators);
        conds.push(`ev.slug = ANY($${params.length})`);
    }
    const evaluateds = toArray(query.evaluated);
    if (evaluateds.length && !evaluateds.includes("include_all")) {
        params.push(evaluateds);
        conds.push(`ed.slug = ANY($${params.length})`);
    }
    if (query.startDate && query.endDate) {
        params.push(query.startDate); conds.push(`r.bucket >= $${params.length}`);
        params.push(query.endDate);   conds.push(`r.bucket <= $${params.length}`);
    }
    return {
        from, conds, params,
        where() { return this.conds.length ? `WHERE ${this.conds.join(" AND ")}` : ""; },
    };
}

// Applies the category selection to a rollup query (single aggregate, no series).
// Returns false when the rollup cannot answer it exactly: with N:N categories, a
// news matching two selected categories spans two rollup rows, so multi-category
// filters are served by the raw path (which deduplicates).
async function rollupCategoryFilter(query, f) {
    const specific = toArray(query.category).filter(c => c !== "include_all");
    const multiCat = await hasNewsCategory();
    if (!specific.length) {
        if (multiCat) f.conds.push("r.category_id IS NULL");
        return true;
    }
    if (multiCat && specific.length > 1) return false;
    f.from += `\n        JOIN category c ON r.category_id = c.id`;
    f.params.push(catValues(specific));
    f.conds.push(`c.slug = ANY($${f.params.length})`);
    return true;
}

async function getGradesChartData(request) {
    const q = request.query;
    if (!(q.startDate && q.endDate) || q.combo || !(await rollupReady())) return getGradesChartDataRaw(request);
    const f = rollupBase(q);
    if (!(await rollupCategoryFilter(q, f))) return getGradesChartDataRaw(request);
    const text = `
        SELECT gb AS grade_bucket, cnt AS count FROM (
            SELECT SUM(r.g1) s1, SUM(r.g2) s2, SUM(r.g3) s3, SUM(r.g4) s4,
                   SUM(r.g5) s5, SUM(r.g6) s6, SUM(r.g7) s7
            ${f.from} ${f.where()}
        ) t, LATERAL (VALUES (1,t.s1),(2,t.s2),(3,t.s3),(4,t.s4),(5,t.s5),(6,t.s6),(7,t.s7)) v(gb,cnt)
        WHERE cnt > 0 ORDER BY gb`;
    const { rows } = await sql.query(text, f.params);
    return rows;
}

async function getVolumeChartData(request) {
    const plan = planTimeBin(request.query);
    if (!plan.useRollup || request.query.combo || !(await rollupReady())) { request.query.aggregation = plan.intervalHours; return getVolumeChartDataRaw(request); }
    const f = rollupBase(request.query);
    if (!(await rollupCategoryFilter(request.query, f))) { request.query.aggregation = plan.intervalHours; return getVolumeChartDataRaw(request); }
    f.params.push(`${plan.intervalHours} hours`);
    const text = `
        SELECT date_bin($${f.params.length}::interval, r.bucket, TIMESTAMP '2025-01-01') AS time_period,
               SUM(r.news_count) AS news_count
        ${f.from} ${f.where()}
        GROUP BY time_period ORDER BY time_period`;
    const { rows } = await sql.query(text, f.params);
    return rows;
}

async function getGaugeData(request) {
    const q = request.query;
    if (!(q.startDate && q.endDate) || q.combo || !(await rollupReady())) return getGaugeDataRaw(request);
    const f = rollupBase(q);
    if (!(await rollupCategoryFilter(q, f))) return getGaugeDataRaw(request);
    const text = `SELECT SUM(r.grade_sum)/NULLIF(SUM(r.grade_count),0) AS average_grade ${f.from} ${f.where()}`;
    const { rows } = await sql.query(text, f.params);
    return rows;
}

async function getLineChartData(request) {
    const q = request.query;
    const plan = planTimeBin(q);
    if (!plan.useRollup || q.combo || !(await rollupReady())) { q.aggregation = plan.intervalHours; return getLineChartDataRaw(request); }

    const multiCat = await hasNewsCategory();
    const categories = toArray(q.category);
    const specificCats = categories.filter(c => c !== "include_all");
    const catHasAll = categories.includes("include_all");
    const isMultiEvaluator = toArray(q.evaluator).length > 1;

    const f = rollupBase(q);
    let selectClause = "", groupClause = "", havingClause = "";
    if (isMultiEvaluator) {
        if (multiCat) f.conds.push("r.category_id IS NULL");
        selectClause = ", ev.slug AS series_label";
        groupClause = ", ev.slug";
    } else if (catHasAll) {
        if (multiCat) {
            // 'include_all' series = deduplicated total rows (category_id IS NULL);
            // per-category series come from the per-category rows.
            f.from += `\n        LEFT JOIN category c ON r.category_id = c.id`;
            selectClause = ", COALESCE(c.slug, 'include_all') AS series_label";
            groupClause = ", COALESCE(c.slug, 'include_all')";
            if (specificCats.length) {
                f.params.push(specificCats);
                f.conds.push(`(r.category_id IS NULL OR c.slug = ANY($${f.params.length}))`);
            } else {
                f.conds.push("r.category_id IS NULL");
            }
        } else {
            // every rollup row carries a category; the ROLLUP super-row is the total
            f.from += `\n        JOIN category c ON r.category_id = c.id`;
            if (specificCats.length) {
                f.params.push(catValues(specificCats));
                f.conds.push(`c.slug = ANY($${f.params.length})`);
            }
            selectClause = ", COALESCE(c.slug, 'include_all') AS series_label";
            groupClause = ", ROLLUP(c.slug)";
            if (specificCats.length) {
                f.params.push(specificCats);
                havingClause = `HAVING c.slug IS NULL OR c.slug = ANY($${f.params.length})`;
            } else {
                havingClause = `HAVING c.slug IS NULL`;
            }
        }
    } else {
        f.from += `\n        JOIN category c ON r.category_id = c.id`;
        if (specificCats.length) {
            f.params.push(catValues(specificCats));
            f.conds.push(`c.slug = ANY($${f.params.length})`);
        }
        selectClause = ", c.slug AS series_label";
        groupClause = ", c.slug";
    }

    f.params.push(`${plan.intervalHours} hours`);
    const iv = `$${f.params.length}`;
    const text = `
        SELECT date_bin(${iv}::interval, r.bucket, TIMESTAMP '2025-01-01') AS time_period${selectClause},
               SUM(r.grade_sum)/NULLIF(SUM(r.grade_count),0) AS average_grade,
               SUM(r.news_count) AS news_count
        ${f.from} ${f.where()}
        GROUP BY time_period${groupClause}
        ${havingClause}
        ORDER BY time_period ASC`;
    const { rows } = await sql.query(text, f.params);
    return rows;
}

async function getSiteStats() {
    try {
        const { rows } = await sql.query("SELECT * FROM site_stats WHERE id = 1");
        return rows[0] || {};
    } catch { return {}; }
}

// A merged layer arrives as repeated combo=ev|ed|cat params ("all" or
// "include_all" = no filter on that slot). The union of the combos is ORed in
// a single WHERE, so a news matching two combos still counts once — the
// rollup cannot express that, which is why combos always ride the raw path.
function parseCombos(query) {
    const raw = toArray(query.combo);
    const open = v => !v || v === "all" || v === "include_all";
    const combos = raw.map(entry => {
        const [ev, ed, cat] = String(entry).split("|");
        return {
            ev: open(ev) ? null : ev,
            ed: open(ed) ? null : ed,
            cat: open(cat) ? null : cat,
        };
    });
    // A fully open combo makes the union universal: no filter at all.
    const universal = combos.some(c => !c.ev && !c.ed && !c.cat);
    return { active: raw.length > 0, combos: universal ? [] : combos.filter(c => c.ev || c.ed || c.cat) };
}

// RAW path (fallback): dynamic mode, sub-hour ranges and combo unions.
// N:N category filtering uses EXISTS over news_category (no row duplication);
// the 'category_series' dimension joins every membership (per-category series);
// 'category_primary' joins only rank 1 (the primary category, for display).
function buildDynamicSQL(query, requiredDimensions = [], multiCat = false) {
    const params = [];
    const conditions = [];
    const joins = new Set(requiredDimensions);
    const { evaluator, evaluated, category, period, startDate, endDate } = query;
    const { active: comboActive, combos } = parseCombos(query);

    if (comboActive) {
        // Union of triples; the flat evaluator/evaluated/category params are
        // ignored (a client sends one or the other, never both).
        if (combos.some(c => c.ev)) joins.add("te_evaluator");
        if (combos.some(c => c.ed)) joins.add("te_evaluated");
        if (!multiCat && combos.some(c => c.cat)) joins.add("category_primary");
        const parts = combos.map(c => {
            const sub = [];
            if (c.ev) {
                params.push([c.ev]);
                sub.push(`te_evaluator.slug = ANY($${params.length})`);
            }
            if (c.ed) {
                params.push([c.ed]);
                sub.push(`te_evaluated.slug = ANY($${params.length})`);
            }
            if (c.cat) {
                params.push(catValues([c.cat]));
                if (multiCat) {
                    sub.push(`EXISTS (SELECT 1 FROM news_category ncf JOIN category cf ON cf.id = ncf.category_id
                    WHERE ncf.news_id = na.id AND cf.slug = ANY($${params.length}))`);
                } else {
                    sub.push(`c.slug = ANY($${params.length})`);
                }
            }
            return `(${sub.join(" AND ")})`;
        });
        if (parts.length) conditions.push(`(${parts.join(" OR ")})`);
    } else {
    if (evaluator) {
        joins.add("te_evaluator");
        const evaluators = toArray(evaluator);
        if (evaluators.length && !evaluators.includes("include_all")) {
            params.push(evaluators);
            conditions.push(`te_evaluator.slug = ANY($${params.length})`);
        }
    }
    if (evaluated) {
        joins.add("te_evaluated");
        const evaluateds = toArray(evaluated);
        if (evaluateds.length && !evaluateds.includes("include_all")) {
            params.push(evaluateds);
            conditions.push(`te_evaluated.slug = ANY($${params.length})`);
        }
    }
    if (category) {
        const categories = toArray(category).filter(c => c !== "include_all");
        if (categories.length) {
            params.push(catValues(categories));
            if (joins.has("category_series")) {
                conditions.push(`c.slug = ANY($${params.length})`);
            } else if (multiCat) {
                conditions.push(`EXISTS (SELECT 1 FROM news_category ncf JOIN category cf ON cf.id = ncf.category_id
                    WHERE ncf.news_id = na.id AND cf.slug = ANY($${params.length}))`);
            } else {
                joins.add("category_primary");
                conditions.push(`c.slug = ANY($${params.length})`);
            }
        }
    }
    }

    if (period && period.toLowerCase().startsWith("last")) {
        const intervals = { last30d: "30 days", last120d: "120 days", last180d: "180 days", last365d: "365 days" };
        if (intervals[period]) {
            params.push(intervals[period]);
            conditions.push(`na.publication_date >= NOW() - CAST($${params.length} AS INTERVAL)`);
        }
    } else if (startDate && endDate) {
        params.push(startDate); conditions.push(`na.publication_date >= $${params.length}`);
        params.push(endDate);   conditions.push(`na.publication_date <= $${params.length}`);
    }

    let joinClause = `FROM analysis a JOIN news_article na ON a.news_id = na.id`;
    if (joins.has("category_series")) {
        joinClause += multiCat
            ? ` JOIN news_category nc ON nc.news_id = na.id JOIN category c ON nc.category_id = c.id`
            : ` JOIN category c ON na.category_id = c.id`;
    } else if (joins.has("category_primary")) {
        joinClause += multiCat
            ? ` JOIN news_category nc ON nc.news_id = na.id AND nc.rank = 1 JOIN category c ON nc.category_id = c.id`
            : ` JOIN category c ON na.category_id = c.id`;
    }
    if (joins.has("te_evaluator")) joinClause += ` JOIN target_entity te_evaluator ON a.evaluator_id = te_evaluator.id`;
    if (joins.has("te_evaluated")) joinClause += ` JOIN target_entity te_evaluated ON a.evaluated_id = te_evaluated.id`;
    if (joins.has("source"))       joinClause += ` JOIN source s ON na.source_id = s.id`;
    if (joins.has("language"))     joinClause += ` JOIN language l ON na.language_id = l.id`;

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return { joinClause, whereClause, params };
}

async function getGradesChartDataRaw(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, [], await hasNewsCategory());
    const query = `SELECT round(a.grade) AS grade_bucket, COUNT(*) AS count ${joinClause} ${whereClause}
                   GROUP BY grade_bucket ORDER BY grade_bucket ASC`;
    const { rows } = await sql.query(query, params);
    return rows;
}

async function getVolumeChartDataRaw(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, [], await hasNewsCategory());
    let hours = parseFloat(request.query.aggregation);
    if (isNaN(hours) || hours <= 0) hours = 1;
    params.push(`${hours} hours`);
    const query = `
        SELECT date_bin($${params.length}::interval, na.publication_date, TIMESTAMP '2025-01-01') AS time_period,
               COUNT(DISTINCT na.id) AS news_count
        ${joinClause} ${whereClause}
        GROUP BY time_period ORDER BY time_period ASC`;
    const { rows } = await sql.query(query, params);
    return rows;
}

async function getGaugeDataRaw(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, [], await hasNewsCategory());
    const isDynamic = !(request.query.startDate && request.query.endDate);
    let query;
    if (isDynamic) {
        let hours = parseFloat(request.query.aggregation);
        if (isNaN(hours) || hours <= 0) hours = 1;
        params.push(`${hours} hours`);
        const iv = `$${params.length}`;
        query = `SELECT AVG(a.grade) AS average_grade ${joinClause} ${whereClause}
                 GROUP BY date_bin(${iv}::interval, na.publication_date, TIMESTAMP '2025-01-01')
                 ORDER BY date_bin(${iv}::interval, na.publication_date, TIMESTAMP '2025-01-01') DESC LIMIT 1`;
    } else {
        query = `SELECT AVG(a.grade) AS average_grade ${joinClause} ${whereClause}`;
    }
    const { rows } = await sql.query(query, params);
    return rows;
}

async function getLineChartDataRaw(request) {
    const { category, evaluator, aggregation } = request.query;
    const multiCat = await hasNewsCategory();
    const categories = toArray(category);
    const specificCats = categories.filter(c => c !== "include_all");
    const catHasAll = categories.includes("include_all");
    const isMultiEvaluator = toArray(evaluator).length > 1;

    let hours = parseFloat(aggregation);
    if (isNaN(hours) || hours <= 0) hours = 1;

    async function runSeries({ dims, selectClause, groupClause, stripCategory = false }) {
        const q = stripCategory ? { ...request.query, category: undefined } : request.query;
        const { joinClause, whereClause, params } = buildDynamicSQL(q, dims, multiCat);
        params.push(`${hours} hours`);
        const iv = `$${params.length}`;
        const text = `
            SELECT date_bin(${iv}::interval, na.publication_date, TIMESTAMP '2025-01-01') AS time_period${selectClause},
                   AVG(a.grade) AS average_grade, COUNT(DISTINCT na.id) AS news_count
            ${joinClause} ${whereClause}
            GROUP BY time_period${groupClause}
            ORDER BY time_period ASC`;
        const { rows } = await sql.query(text, params);
        return rows;
    }

    // A combo union is a single merged series; the client retags it with the
    // layer key, so the label here is just a placeholder.
    if (request.query.combo) {
        return runSeries({
            dims: [],
            selectClause: ", 'combo' AS series_label",
            groupClause: "",
        });
    }
    if (isMultiEvaluator) {
        return runSeries({
            dims: ["te_evaluator"],
            selectClause: ", te_evaluator.slug AS series_label",
            groupClause: ", te_evaluator.slug",
        });
    }
    if (catHasAll) {
        // Total series over everything; per-category series only when also selected.
        const total = await runSeries({
            dims: [], selectClause: ", 'include_all' AS series_label", groupClause: "", stripCategory: true,
        });
        if (!specificCats.length) return total;
        const perCat = await runSeries({
            dims: ["category_series"],
            selectClause: ", c.slug AS series_label",
            groupClause: ", c.slug",
        });
        return [...total, ...perCat];
    }
    return runSeries({
        dims: ["category_series"],
        selectClause: ", c.slug AS series_label",
        groupClause: ", c.slug",
    });
}

// Row-level widgets: news list + relationship map
async function getNewsList(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(
        request.query,
        ["category_primary", "source", "language", "te_evaluator", "te_evaluated"],
        await hasNewsCategory(),
    );
    const { limit, offset, sort_by, sort_dir } = request.query;

    const sortMap = {
        date: "na.publication_date", headline: "na.headline", source: "s.name",
        category: "c.slug", grade: "a.grade", analysis: "a.analysis_text"
    };
    let orderClause = "ORDER BY na.publication_date DESC, a.grade DESC";
    if (sort_by && sortMap[sort_by]) {
        const direction = (sort_dir && sort_dir.toUpperCase() === "ASC") ? "ASC" : "DESC";
        orderClause = `ORDER BY ${sortMap[sort_by]} ${direction}`;
    }

    const countResult = await sql.query(`SELECT COUNT(*) AS total_count ${joinClause} ${whereClause};`, params);
    const totalCount = parseInt(countResult.rows[0].total_count, 10);
    const limitVal = parseInt(limit, 10) || 50;
    const offsetVal = parseInt(offset, 10) || 0;

    const query = `
        SELECT na.id, na.publication_date as date, na.headline, na.summary,
               na.article_text, na.url, l.iso_code as language, s.name as source,
               c.slug as category, a.grade, a.analysis_text as analysis,
               te_evaluator.slug as evaluator_entity, te_evaluated.slug as evaluated_entity
        ${joinClause} ${whereClause} ${orderClause}
        LIMIT ${limitVal} OFFSET ${offsetVal};`;
    const { rows } = await sql.query(query, params);
    return { total_count: totalCount, data: rows };
}

async function getRelationships() {
    const { rows } = await sql.query(`
        SELECT e.slug as evaluator_slug, t.slug as evaluated_slug
        FROM target_entities_relationships ter
        JOIN target_entity e ON ter.evaluator_id = e.id
        JOIN target_entity t ON ter.evaluated_id = t.id`);
    const relationshipMap = {};
    rows.forEach(row => {
        (relationshipMap[row.evaluator_slug] ||= []).push(row.evaluated_slug);
    });
    return relationshipMap;
}

export default async function handler(request, response) {
    response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    try {
        let data;
        switch (request.query.widget) {
            case "grade":   data = await getGradesChartData(request); break;
            case "volume":  data = await getVolumeChartData(request); break;
            case "gauge":   data = await getGaugeData(request); break;
            case "details": data = await getNewsList(request); break;
            case "relationships": data = await getRelationships(); break;
            case "stats":   data = await getSiteStats(); break;
            case "line":
            default:        data = await getLineChartData(request); break;
        }
        return response.status(200).json(data);
    } catch (error) {
        console.error("API error:", error);
        return response.status(500).json({ error: "Failed to retrieve data." });
    }
}
