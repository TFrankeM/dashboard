
/*
    Communicates with the backend `api/data.js`, the endpoint that provides the data for the widgets.
*/

const API_ENDPOINT = "/api/data";
const FETCH_TIMEOUT_MS = 30000;


function buildApiUrl(filters, widgetType) {
    /* Builds the URL with parameters
    filters := Object containing filter parameters
    widgetType := "grade", "volume", "gauge", "line", "details", "relationships" or "stats"
    */

    const url_params = new URLSearchParams();
    url_params.append("widget", widgetType);

    if (filters.period) {
        url_params.append("period", filters.period);
    } else if (filters.startDate && filters.endDate) {
        url_params.append("startDate", filters.startDate);
        url_params.append("endDate", filters.endDate);
    };

     if (filters.evaluator) {
        if (Array.isArray(filters.evaluator)) {
            filters.evaluator.forEach(ev => url_params.append("evaluator", ev));
        } else {
            url_params.append("evaluator", filters.evaluator);
        }
    };

    if (filters.evaluated) {
        if (Array.isArray(filters.evaluated)) {
            filters.evaluated.forEach(ent => url_params.append("evaluated", ent));
        } else {
            url_params.append("evaluated", filters.evaluated);
        }
    };

    if (filters.aggregation) {
        url_params.append("aggregation", filters.aggregation);
    };

    if (filters.category) {
        if (Array.isArray(filters.category)) {
            filters.category.forEach(cat => url_params.append("category", cat));
        } else {
            url_params.append("category", filters.category);
        }
    };

    // Merged layer: repeated ev|ed|cat combos, ORed (deduplicated) server-side.
    if (filters.combo) {
        (Array.isArray(filters.combo) ? filters.combo : [filters.combo])
            .forEach(c => url_params.append("combo", c));
    };

    // Filters for details section
    if (filters.limit !== undefined && filters.limit !== null) {
        url_params.append("limit", filters.limit);
    };

    if (filters.offset !== undefined && filters.offset !== null) {
        url_params.append("offset", filters.offset)
    }
    if (filters.sort_by) {
        url_params.append("sort_by", filters.sort_by);
    }
    if (filters.sort_dir) {
        url_params.append("sort_dir", filters.sort_dir);
    }
    return url_params;
}


async function fetchFromApi(filters, widgetType) {
    /* Internal function to fetch data from the API */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        let url_params = buildApiUrl(filters, widgetType);
        // Encode spaces as %20 instead of "+" so the serverless parser reads them correctly.
        url_params = url_params.toString().replace(/\+/g, "%20");
        const fullUrl = `${API_ENDPOINT}?${url_params.toString()}`;

        const response = await fetch(fullUrl, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(`API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching data from API:", error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}


/* Functions consumed by the page scripts */
export async function fetchGradesHistogramData(filters) {
    return await fetchFromApi(filters, "grade");
}

export async function fetchVolumeChartData(filters) {
    const safeFilters = { ...filters, aggregation: filters.aggregation || 1 }
    return await fetchFromApi(safeFilters, "volume");
}

export async function fetchGaugeData(filters) {
    const data = await fetchFromApi(filters, "gauge");
    if (data && data.length > 0) {
        return data[0].average_grade;
    }
    return null;
}

export async function fetchLineChartData(filters) {
    const safeFilters = { ...filters, aggregation: filters.aggregation || 1 }
    return await fetchFromApi(safeFilters, "line");
}

export async function fetchDetailsData(filters) {
    return await fetchFromApi(filters, "details");
}

export async function fetchRelationships() {
    return await fetchFromApi({}, "relationships") || {};
}

export async function fetchStats() {
    return await fetchFromApi({}, "stats") || {};
}

