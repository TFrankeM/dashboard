/*
    Responsable for comunicating with the backend `api/data.js`, the endpoint that provides the data for the widgets.
*/

const API_ENDPOINT = "/api/data";

/* Builds the URL with Parameters*/
function buildApiUrl(filters, widgetType) {
    const url_params = new URLSearchParams();
    url_params.append("widget", widgetType);

    if (filters.period) {
        url_params.append("period", filters.period);
    };

    if (filters.reviewer) {
        url_params.append("reviewer", filters.reviewer);
    };
    if (filters.reviewedEntity) {
        url_params.append("reviewed_entity", filters.reviewedEntity);
    };

    if (filters.aggregation && widgetType === "line") {
        url_params.append("aggregation", filters.aggregation);
    };

    // Array for categories
    if (filters.category) {
        if (Array.isArray(filters.category)) {
            filters.category.forEach(cat => url_params.append("category", cat));
        } else {
            url_params.append("category", filters.category);
        }
    };

    return url_params;
}

/* Internal function to fetch data from the API */
async function fetchFromApi(filters, widgetType) {
    try {
        let url_params = buildApiUrl(filters, widgetType);
        url_params = url_params.toString().replace(/\+/g, "%20");
        const fullUrl = `${API_ENDPOINT}?${url_params.toString()}`;

        console.log(`[Adapter] Requesting: ${fullUrl}`);

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
export async function fetchLineChartData(filters) {
    const safeFilters = {
        ...filters,
        aggregation: filters.aggregation || "weekly"
    }
    return await fetchFromApi(safeFilters, "line");
}

export async function fetchBarChartData(filters) {
    return await fetchFromApi(filters, "bar");
}

export async function fetchGaugeData(filters) {
    const data = await fetchFromApi(filters, "gauge");
    if (data && data.length > 0) {
        return data[0].average_grade;
    }
    return null;
}
