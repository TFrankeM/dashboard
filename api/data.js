
import { sql } from "@vercel/postgres";


// Basic WHERE clause used by all charts
function buildCommonFilters(query, params) {
  const { reviewer, reviewed_entity, category, period, start_date, end_date } = query;
  const conditions = [];

  if (reviewer) {
    params.push(reviewer);
    conditions.push(`evaluator_entity = $${params.length}`);
  }

  if (reviewed_entity) {
    params.push(reviewed_entity);
    conditions.push(`evaluated_entity = $${params.length}`);
  }

  if (category) {
    let categories = Array.isArray(category) ? category : [category];
    if (!categories.includes("Todas") && !categories.includes("All")) {
      params.push(categories);
      conditions.push(`category = ANY($${params.length})`);
    }
  }

  // Dynamic time mode
  if (period && period.startsWith("Last")) {
    let interval;
    // if (period === "Last24h") interval = "24 hours";
    // else if (period === "Last7d") interval = "7 days";
    if (period === "Last30d") interval = "30 days";
    else if (period === "Last120d") interval = "120 days";
    else if (period === "Last180d") interval = "180 days";
    else if (period === "Last365d") interval = "365 days";

    if (interval) {
      params.push(interval);
      conditions.push(`date >= NOW() - CAST($${params.length} AS INTERVAL)`);
    }
  }
  // Fixed date range mode
  else if (start_date && end_date) {
    params.push(start_date);
    conditions.push(`date >= $${params.length}`);
    params.push(end_date);
    conditions.push(`date <= $${params.length}`);
  }

  return conditions;
}


// GAUGE CHART
async function getGaugeData(request) {
  const params = [];
  
  const gaugeQuery = { ...request.query }; 

  //console.log("Gauge Query:", gaugeQuery);
  const conditions = buildCommonFilters(gaugeQuery, params);
  //console.log("Gauge Conditions:", conditions, params);
  // if no start and end date provided => dynamic mode => recent day logic
  const isStaticMode = gaugeQuery.start_date && gaugeQuery.end_date;
  let timeCondition = "";
  //console.log("isStaticMode:", isStaticMode);
  if (!isStaticMode) {
      const whereClauseBase = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      timeCondition = `
        AND DATE_TRUNC('day', date) = (
          SELECT DATE_TRUNC('day', MAX(date))
          FROM noticias
          ${whereClauseBase}
        )
      `;
      // calculate IIMEX for 30 minutes window
      /*
      timeCondition = `
        AND date >= (
            SELECT MAX(date) 
            FROM noticias 
            ${whereClauseBase}
        ) - INTERVAL '30 minutes'
      `;
      */
  };

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "WHERE 1=1";
  const query = `
    SELECT AVG(grade) as average_grade
    FROM noticias
    ${whereClause}
    ${timeCondition};
  `;

  //console.log("Query Details:", query, params);

  const { rows } = await sql.query(query, params);
  return rows;
}


// BAR CHART
async function getBarChartData(request) {
  const params = [];

  const conditions = buildCommonFilters(request.query, params);
  // Bar chart groups by YEAR
  const query = `
    SELECT 
      DATE_TRUNC('year', date) AS time_period,
      COUNT(*) AS news_count
    FROM noticias
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY 
      time_period
    ORDER BY 
      time_period ASC;
  `;
  const { rows } = await sql.query(query, params);  
  return rows;
}

// NEWS DETAILS LIST
async function getNewsList(request) {
    const params = [];
    //console.log("Request Query:", request.query);
    const { date, aggregation, limit } = request.query;
    //console.log("Target Date:", date, "Aggregation:", aggregation, "Limit:", limit);
    const queryForFilters = { ...request.query };
    delete queryForFilters.period; 
    
    const conditions = buildCommonFilters(queryForFilters, params);

    if (date && aggregation) {
        let dateTrunc = 'day';
        switch (aggregation) {
            case 'monthly': dateTrunc = 'month'; break;
            case 'weekly': dateTrunc = 'week'; break;
            case 'daily': dateTrunc = 'day'; break;
            case 'hourly': dateTrunc = 'hour'; break;
            case 'half_hourly': dateTrunc = 'minute'; break;
            default: dateTrunc = 'day';
        }

        params.push(date);
        
        // ::date para forçar o banco a olhar apenas o dia (YYYY-MM-DD)
        if (dateTrunc === 'day') {
            conditions.push(`date::date = $${params.length}::date`);
        } else {
            conditions.push(`DATE_TRUNC('${dateTrunc}', date) = DATE_TRUNC('${dateTrunc}', $${params.length}::timestamp)`);
        }
    }

    const limitClause = limit ? `LIMIT ${parseInt(limit)}` : 'LIMIT 50';

    const query = `
        SELECT 
            id,
            date,
            headline,
            summary,
            article_text,
            url,
            language,
            source,
            category,
            grade,
            analysis
        FROM noticias
        ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
        ORDER BY date DESC, grade DESC
        ${limitClause};
    `;

    //console.log("Query Details:", query, params);

    const { rows } = await sql.query(query, params);
    return rows;
}


// LINE CHART
async function getLineChartData(request) {
  const params = [];
  const conditions = buildCommonFilters(request.query, params);
  const { aggregation, category } = request.query;

  // Verifies if "Todas" is selected
  const hasAll = category && (Array.isArray(category) ? category.includes("Todas") : category === "Todas");

  // check if category has a meaningful value
  const showCategoryBreakDown = !!category;

  let dateTrunc = "week";
  switch (aggregation) {
    case "yearly": dateTrunc = "year"; break;
    case "quarterly": dateTrunc = "quarter"; break;
    case "monthly": dateTrunc = "month"; break;
    case "daily": dateTrunc = "day"; break;
    case "hourly": dateTrunc = "hour"; break;
    case "minutely": dateTrunc = "minute"; break;
    case "secondly": dateTrunc = "second"; break;
    default: dateTrunc = "week";
  }

  let selectClause = "";
  let groupClause = "";

  if (showCategoryBreakDown) {
    if (hasAll) {
      selectClause = ", COALESCE(category, 'Todas') as category";
      groupClause = ", ROLLUP(category)";
    } else {
      selectClause = ", category";
      groupClause = ", category";
    }
  }

  const query = `
    SELECT 
      DATE_TRUNC('${dateTrunc}', date) AS time_period${selectClause},
      AVG(grade) AS average_grade
    FROM noticias
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY 
      time_period${groupClause}
    ORDER BY 
      time_period ASC;
  `;
  const { rows } = await sql.query(query, params);
  return rows;
}


// ROTEADOR
/*
request.query e.g.
{
  "widget": "gauge",
  "period": "Last365d",
  "reviewer": "Argentina",
  "reviewed_entity": "Brasil",
  "category": [
    "Meio ambiente",
    "Conflito, guerra e paz"
  ]
}
*/
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const { widget } = request.query;
  try {
    let data;

    switch (widget) {
      case "gauge":
        data = await getGaugeData(request);
        break;
      case "bar":
        data = await getBarChartData(request);
        break;
      case "details":
        data = await getNewsList(request);
        break;
      case "line":
      default:
        data = await getLineChartData(request);
        break;
    }

    return response.status(200).json(data);

  } catch (error) {
    console.error("Erro na API:", error);
    return response.status(500).json({ error: "Falha ao buscar dados." });
  }
}


