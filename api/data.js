import { createPool } from "@vercel/postgres";

// @vercel/postgres looks only for the POSTGRES_URL env var. In this project the
// Vercel-managed variable is exposed as POSTGRES_URL_backup, so we resolve the
// connection string explicitly and fall back to it.
const sql = createPool({
    connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_backup,
});

// Mapping frontend technical slugs to DB readable names (stored in 'slug' column)
const CATEGORY_MAP = {
    "artes_cultura_entretenimento_midia": "Artes, cultura, entretenimento e mídia",
    "ciencia_tecnologia": "Ciência e tecnologia",
    "conflito_guerra_paz": "Conflito, guerra e paz",
    "crime_lei_justica": "Crime, lei e justiça",
    "desastres_acidentes_emergencias": "Desastres, acidentes e emergências",
    "economia_negocios_financas": "Economia, negócios e finanças",
    "educacao": "Educação",
    "esporte": "Esporte",
    "estilo_vida_lazer": "Estilo de vida e lazer",
    "interesse_humano": "Interesse humano",
    "meio_ambiente": "Meio ambiente",
    "meteorologia": "Meteorologia",
    "nao_informado": "Não informado",
    "politica": "Política",
    "religiao_crencas": "Religião e crenças",
    "saude": "Saúde",
    "sociedade": "Sociedade",
    "trabalho": "Trabalho"
};

function buildDynamicSQL(query, requiredDimensions = []) {
    const params = [];
    const conditions = [];
    
    // No duplicate joins
    const joins = new Set();
    requiredDimensions.forEach(dim => joins.add(dim));

    const { evaluator, evaluated, category, period, startDate, endDate } = query;

    if (evaluator) {
        joins.add("te_evaluator");
        let evaluators = Array.isArray(evaluator) ? evaluator : [evaluator];
        if (evaluators.length > 0 && !evaluators.includes("include_all")) {
            params.push(evaluators);
            conditions.push(`te_evaluator.slug = ANY($${params.length})`);
        }   
    }
    if (evaluated) {
        joins.add("te_evaluated");
        let evaluateds = Array.isArray(evaluated) ? evaluated : [evaluated];
        if (evaluateds.length > 0 && !evaluateds.includes("include_all")) {
            params.push(evaluateds);
            conditions.push(`te_evaluated.slug = ANY($${params.length})`);
        }
    }
    if (category) {
        joins.add("category");
        let categories = Array.isArray(category) ? category : [category];
        if (categories.length > 0 && !categories.includes("include_all")) {
            const dbCategories = categories.map(cat => CATEGORY_MAP[cat] || cat);
            params.push(dbCategories);
            conditions.push(`c.slug = ANY($${params.length})`);
        }
    }

    if (period && period.toLowerCase().startsWith("last")) {  // Dynamic time mode
        const intervals = {
            "last30d": "30 days",
            "last120d": "120 days",
            "last180d": "180 days",
            "last365d": "365 days"
        };
        if (intervals[period]) {
            params.push(intervals[period]);
            conditions.push(`na.publication_date >= NOW() - CAST($${params.length} AS INTERVAL)`);
        }
    } else if (startDate && endDate) {          // Fixed date range mode
        params.push(startDate);
        conditions.push(`na.publication_date >= $${params.length}`);
        params.push(endDate);
        conditions.push(`na.publication_date <= $${params.length}`);
    }

    // tables 'analysis' e 'news_article'
    let joinClause = `FROM analysis a JOIN news_article na ON a.news_id = na.id`;
    
    if (joins.has("category"))     joinClause += ` JOIN category c ON na.category_id = c.id`;
    if (joins.has("te_evaluator")) joinClause += ` JOIN target_entity te_evaluator ON a.evaluator_id = te_evaluator.id`;
    if (joins.has("te_evaluated")) joinClause += ` JOIN target_entity te_evaluated ON a.evaluated_id = te_evaluated.id`;
    if (joins.has("source"))       joinClause += ` JOIN source s ON na.source_id = s.id`;
    if (joins.has("language"))     joinClause += ` JOIN language l ON na.language_id = l.id`;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { joinClause, whereClause, params };
}


async function getGradesChartData(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, []);

    const query = `
        SELECT round(a.grade) as grade_bucket, COUNT(*) AS count
            ${joinClause}
            ${whereClause}
        GROUP BY grade_bucket
        ORDER BY grade_bucket ASC;
    `;
    console.log("Grades Chart SQL:\n", query, "Params:", params);
    const { rows } = await sql.query(query, params);
    return rows;
}


async function getVolumeChartData(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, []);
    
    let hours = parseFloat(request.query.aggregation); 
    if (isNaN(hours) || hours <= 0) hours = 1;

    params.push(`${hours} hours`);
    const intervalParam = `$${params.length}`;

    const query = `
        SELECT 
            date_bin(${intervalParam}::interval, na.publication_date, TIMESTAMP '2025-01-01') AS time_period,
        COUNT(DISTINCT na.id) AS news_count
            ${joinClause}
            ${whereClause}
        GROUP BY time_period
        ORDER BY time_period ASC;
    `;
    console.log("Volume Chart SQL:\n", query, "Params:", params);
    const { rows } = await sql.query(query, params);  
    return rows;
}


async function getGaugeData(request) {
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, []);

    const isDynamic = !(request.query.startDate && request.query.endDate);
    
    let query;
    if (isDynamic) {
        let hours = parseFloat(request.query.aggregation);
        if (isNaN(hours) || hours <= 0) hours = 1;
        params.push(`${hours} hours`);
        const intervalParam = `$${params.length}`;

        query = `
            SELECT AVG(a.grade) as average_grade
            ${joinClause}
            ${whereClause}
            GROUP BY date_bin(${intervalParam}::interval, na.publication_date, TIMESTAMP '2025-01-01')
            ORDER BY date_bin(${intervalParam}::interval, na.publication_date, TIMESTAMP '2025-01-01') DESC
            LIMIT 1;
        `;
    } else {
        query = `
            SELECT AVG(a.grade) as average_grade
            ${joinClause}
            ${whereClause};
        `;
    }

    const { rows } = await sql.query(query, params);
    return rows;
}


async function getLineChartData(request) {
    const { category, evaluator, aggregation } = request.query;

    const categories = category ? (Array.isArray(category) ? category : [category]) : [];
    const evaluators = evaluator ? (Array.isArray(evaluator) ? evaluator : [evaluator]) : [];

    const catHasAll = categories.includes("include_all");
    const isMultiEvaluator = evaluators.length > 1;

    // Descobre quais dimensões PRECISAM estar no JOIN para o agrupamento (GROUP BY) funcionar
    const requiredDimensions = [];
    if (isMultiEvaluator) requiredDimensions.push('te_evaluator');
    if (!isMultiEvaluator && !catHasAll && categories.length > 0) requiredDimensions.push('category');

    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, requiredDimensions);

    let hours = parseFloat(aggregation);
    if (isNaN(hours) || hours <= 0) hours = 1;
    params.push(`${hours} hours`);
    const intervalParam = `$${params.length}`;

    let selectClause = "", groupClause = "", havingClause = "";

    if (isMultiEvaluator) {
        selectClause = ", te_evaluator.slug as series_label";
        groupClause = ", te_evaluator.slug";
    } else {
        if (catHasAll) {
            selectClause = ", COALESCE(c.slug, 'include_all') as series_label";
            groupClause = ", ROLLUP(c.slug)";
            const specificCats = categories.filter(cat => cat !== "include_all");
            if (specificCats.length > 0) {
                const dbCategories = specificCats.map(cat => CATEGORY_MAP[cat] || cat);
                params.push(dbCategories);
                havingClause = `HAVING c.slug IS NULL OR c.slug = ANY($${params.length})`;
            } else {
                havingClause = `HAVING c.slug IS NULL`;
            }
        } else {
            selectClause = ", c.slug as series_label";
            groupClause = ", c.slug";
        }
    }

    const query = `
        SELECT 
        date_bin(${intervalParam}::interval, na.publication_date, TIMESTAMP '2025-01-01') AS time_period${selectClause},
        AVG(a.grade) AS average_grade,
        COUNT(DISTINCT na.id) AS news_count
        ${joinClause}
        ${whereClause}
        GROUP BY time_period${groupClause}
        ${havingClause}
        ORDER BY time_period ASC;
    `;
    const { rows } = await sql.query(query, params);
    return rows;
}


async function getNewsList(request) {
    // Para listar as notícias, precisamos de todas as dimensões para exibir na tela
    const { joinClause, whereClause, params } = buildDynamicSQL(request.query, ['category', 'source', 'language', 'te_evaluator', 'te_evaluated']);
    
    const { limit, offset, sort_by, sort_dir } = request.query;

    const sortMap = {
        "date": "na.publication_date",
        "headline": "na.headline",
        "source": "s.name",
        "category": "c.slug",
        "grade": "a.grade",
        "analysis": "a.analysis_text"
    };

    let orderClause = "ORDER BY na.publication_date DESC, a.grade DESC";
    if (sort_by && sortMap[sort_by]) {
        const direction = (sort_dir && sort_dir.toUpperCase() === "ASC") ? "ASC" : "DESC";
        orderClause = `ORDER BY ${sortMap[sort_by]} ${direction}`;
    }

    const countQuery = `SELECT COUNT(*) AS total_count ${joinClause} ${whereClause};`;
    const countResult = await sql.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total_count, 10);

    const limitVal = parseInt(limit, 10) || 50;
    const offsetVal = parseInt(offset, 10) || 0;
    
    const query = `
        SELECT 
            na.id, na.publication_date as date, na.headline, na.summary,
            na.article_text, na.url, l.iso_code as language, s.name as source,
            c.slug as category, a.grade, a.analysis_text as analysis,
            te_evaluator.slug as evaluator_entity, te_evaluated.slug as evaluated_entity
        ${joinClause}
        ${whereClause}
        ${orderClause}
        LIMIT ${limitVal} OFFSET ${offsetVal};
    `;
    const { rows } = await sql.query(query, params);

    return { total_count: totalCount, data: rows };
}


async function getRelationships() {
    const query = `
        SELECT e.slug as evaluator_slug, t.slug as evaluated_slug
        FROM target_entities_relationships ter
        JOIN target_entity e ON ter.evaluator_id = e.id
        JOIN target_entity t ON ter.evaluated_id = t.id
    `;
    const { rows } = await sql.query(query);
    
    // Convert rows to a map: { evaluator_slug: [evaluated_slug1, ...] }
    const relationshipMap = {};
    rows.forEach(row => {
        if (!relationshipMap[row.evaluator_slug]) {
            relationshipMap[row.evaluator_slug] = [];
        }
        relationshipMap[row.evaluator_slug].push(row.evaluated_slug);
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
        case "line":
        default:        data = await getLineChartData(request); break;
        }
        return response.status(200).json(data);
    } catch (error) {
        console.error("API error:", error);
        return response.status(500).json({ error: "Failed to retrieve data." });
    }
}
