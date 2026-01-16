
import { sql } from "@vercel/postgres";


function buildCommonFilters(query, params) {
  // Basic WHERE clause used by all charts
  const { reviewer, reviewed_entity, category, period, start_date, end_date, politicalAlignment } = query;
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
    if (!categories.includes("Todas")) {
      params.push(categories);
      conditions.push(`category = ANY($${params.length})`);
    }
  }

  if (politicalAlignment) {
    let alignments = Array.isArray(politicalAlignment) ? politicalAlignment : [politicalAlignment];
    if (alignments.length > 0) {
      params.push(alignments);
      conditions.push(`political_alignment = ANY($${params.length})`);
    }
  }

  // Dynamic time mode
  if (period && period.startsWith("Last")) {
    let interval;
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
    conditions.push(`date::date >= $${params.length}::date`);
    params.push(end_date);
    conditions.push(`date::date <= $${params.length}::date`);
  }

  return conditions;
}


// GRADES HISTOGRAM
async function getGradesChartData(request) {
  const params = [];
  const conditions = buildCommonFilters(request.query, params);

  const query = `
    SELECT 
      round(grade) as grade_bucket,
      COUNT(*) AS count
    FROM noticias
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY 
      grade_bucket
    ORDER BY 
      grade_bucket ASC;
  `;

  const { rows } = await sql.query(query, params);
  return rows;
}


// VOLUME CHART
async function getVolumeChartData(request) {
  const params = [];
  const conditions = buildCommonFilters(request.query, params);
  const { aggregation } = request.query;
  let hours = parseFloat(aggregation); 

  if (isNaN(hours) || hours <= 0) {
      hours = 1;
  }

  params.push(`${hours} hours`);
  const intervalParam = `$${params.length}`;

  const query = `
    SELECT 
      date_bin(${intervalParam}::interval, date, TIMESTAMP '2025-01-01') AS time_period,
      COUNT(*) AS news_count
    FROM noticias
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY 
      time_period
    ORDER BY 
      time_period ASC;
  `;
  const { rows } = await sql.query(query, params);  

  console.log("Volume Chart Query:", query, params);
  return rows;
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

      let hours = parseFloat(gaugeQuery.aggregation);
      if (isNaN(hours) || hours <= 0) {
        hours = 1;
      }
      params.push(`${hours} hours`);
      const intervalParam = `$${params.length}`;

      const whereClauseBase = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      timeCondition = `
        AND date_bin(${intervalParam}::interval, date, TIMESTAMP '2025-01-01') = (
          SELECT date_bin(${intervalParam}::interval, MAX(date), TIMESTAMP '2025-01-01')
          FROM noticias
          ${whereClauseBase}
        )
      `;

      // calculate IMíd.IA for 30 minutes window
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


// LINE CHART
async function getLineChartData(request) {
  const params = [];
  const conditions = buildCommonFilters(request.query, params);
  const { aggregation, category, politicalAlignment } = request.query;

  // listas de seleção
  const categories = category ? (Array.isArray(category) ? category : [category]) : [];
  const alignments = politicalAlignment ? (Array.isArray(politicalAlignment) ? politicalAlignment : [politicalAlignment]) : [];

  // flags de "Todos"
  const catHasAll = categories.includes("Todas");
  const polHasAll = alignments.includes("Consolidado");

  // Se tivermos mais de 1 viés político selecionado, a prioridade é comparar os vieses.
  // Nesse caso, o gráfico deve mostrar uma linha para cada viés (Ex: Democrata, Republicano).
  const isMultiPolitical = alignments.length > 1;

  let hours = parseFloat(aggregation);
  if (isNaN(hours) || hours <= 0) {
      hours = 1;
    }
  params.push(`${hours} hours`);
  const intervalParam = `$${params.length}`;

  let selectClause = "";
  let groupClause = "";
  let havingClause = "";

  if (isMultiPolitical) {

      if (polHasAll) {
          selectClause = ", COALESCE(political_alignment, 'Consolidado') as series_label";
          groupClause = ", ROLLUP(political_alignment)";
          
          const specificPols = alignments.filter(p => p !== "Consolidado");
          if (specificPols.length > 0) {
             params.push(specificPols);
             havingClause = `HAVING political_alignment IS NULL OR political_alignment = ANY($${params.length})`;
          } else {
             havingClause = `HAVING political_alignment IS NULL`; 
          }
      } else {
          selectClause = ", political_alignment as series_label";
          groupClause = ", political_alignment";
      }

  } else {

      if (catHasAll) {
          selectClause = ", COALESCE(category, 'Todas') as series_label";
          groupClause = ", ROLLUP(category)";
          
          const specificCats = categories.filter(c => c !== "Todas");
          
          if (specificCats.length > 0) {
              params.push(specificCats);
              havingClause = `HAVING category IS NULL OR category = ANY($${params.length})`;
          } else {
              havingClause = `HAVING category IS NULL`;
          }

      } else {
          selectClause = ", category as series_label";
          groupClause = ", category";
      }
  }

  const query = `
    SELECT 
      date_bin(${intervalParam}::interval, date, TIMESTAMP '2025-01-01') AS time_period${selectClause},
      AVG(grade) AS average_grade
    FROM noticias
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY 
      time_period${groupClause}
    ${havingClause}
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
      case "grade":
        data = await getGradesChartData(request);
        //console.log("Grades Data:", data);
        break;
      case "volume":
        data = await getVolumeChartData(request);
        break;
      case "gauge":
        data = await getGaugeData(request);
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


