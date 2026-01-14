
/*
    Responsable for comunicating with the backend `api/data.js`, the endpoint that provides the data for the widgets.
*/

const API_ENDPOINT = "/api/data";


function buildApiUrl(filters, widgetType) {
    /* Builds the URL with parameters*/

    const url_params = new URLSearchParams();
    url_params.append("widget", widgetType);

    if (filters.period) {
        url_params.append("period", filters.period);
    } else if (filters.startDate && filters.endDate) {
        url_params.append("start_date", filters.startDate);
        url_params.append("end_date", filters.endDate);
    };

    if (filters.reviewer) {
        url_params.append("reviewer", filters.reviewer);
    };

    if (filters.reviewedEntity) {
        url_params.append("reviewed_entity", filters.reviewedEntity);
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

    if (filters.politicalAlignment) {
        if (Array.isArray(filters.politicalAlignment)) {
            filters.politicalAlignment.forEach(p => url_params.append("politicalAlignment", p));
        } else {
            url_params.append("politicalAlignment", filters.politicalAlignment);
        }
    }
    
    // Filters for details section
    if (filters.limit) {
        url_params.append("limit", filters.limit);
    };

    if (filters.date) {
        url_params.append("date", filters.date);
    };

    return url_params;
}



async function fetchFromApi(filters, widgetType) {
    /* Internal function to fetch data from the API */
    try {
        let url_params = buildApiUrl(filters, widgetType);
        url_params = url_params.toString().replace(/\+/g, "%20");
        const fullUrl = `${API_ENDPOINT}?${url_params.toString()}`;

        console.log(`[Fetching from API] Requesting: ${fullUrl}`);

        const response = await fetch(fullUrl);

        if (!response.ok) {
            throw new Error(`API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching data from API:", error);
        return null;
    }
}



/* Functions exported to script.js */
export async function fetchGradesHistogramData(filters) {
    return await fetchFromApi(filters, "grade");
}

export async function fetchVolumeChartData(filters) {
    const safeFilters = { ...filters, aggregation: filters.aggregation || "daily" }
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
    const safeFilters = { ...filters, aggregation: filters.aggregation || "daily" }
    return await fetchFromApi(safeFilters, "line");
}

export async function fetchDetailsData(filters) {
    return await fetchFromApi(filters, "details");
}

