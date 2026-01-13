// Data & Formatting Utilities

export const STAT_MAPPING = {
    'res_oq': 'OQ', 'res_cr': 'CR', 'res_cd': 'CD', 'res_dr': 'DR', 
    'res_fl': 'FL', 'res_hr': 'HR', 'res_ma': 'MA', 'res_pe': 'PE', 
    'res_sr': 'SR', 'res_ut': 'UT'
};

export const getStatColorClass = (rating) => {
    if (!rating || rating === '-') return '';
    if (rating >= 0.950) return 'stat-red';
    if (rating >= 0.900 && rating < 0.950) return 'stat-yellow';
    if (rating >= 0.500 && rating < 0.900) return 'stat-green';
    return '';
};

export const formatDate = (epoch) => {
    if (!epoch) return "-";
    // Check if seconds or ms
    const ts = epoch < 1e12 ? epoch * 1000 : epoch;
    const d = new Date(ts);
    // Mimic the manual formatting from table.js
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
};

// --- FILTERING & SORTING LOGIC ---
export const getDescendantLabels = (taxonomyTree, parentLabel) => {
    if (!parentLabel || !taxonomyTree) return [];
    let descendants = [];

    const findNode = (nodes, target) => {
        for (const node of nodes) {
            if (node.label === target) return node;
            if (node.children) {
                const found = findNode(node.children, target);
                if (found) return found;
            }
        }
        return null;
    };

    const collect = (node) => {
        if (node.children) {
            node.children.forEach(child => {
                descendants.push(child.label.toLowerCase());
                collect(child);
            });
        }
    };

    const parentNode = findNode(taxonomyTree, parentLabel);
    if (parentNode) collect(parentNode);
    return descendants;
};

const SORT_BEHAVIOR = {
    // Name/Type: Up = A-Z (Ascending)
    alpha: 'asc', 
    // Stats/Rating: Up = Highest to Lowest (Descending)
    numeric: 'desc',
    // Date: Up = Most Recent to Oldest (Descending)
    date: 'desc',
    // Status: Up = Active to Inactive (Descending)
    status: 'desc',
    // Location: Up = A-Z (Ascending)
    planet: 'asc'
};

const COLUMN_CONFIG = {
    name: 'alpha',
    type: 'alpha',
    planet: 'planet',
    date_reported: 'date',
    is_active: 'status',
};

export const filterResources = (data, filters, taxonomyTree) => {
    if (!data) return [];
    
    // Pre-calculate valid labels if a category is selected
    let validLabels = [];
    if (filters.category && filters.category !== "Resources" && filters.category !== "All Resources") {
        validLabels = [
            filters.category.toLowerCase(), 
            ...getDescendantLabels(taxonomyTree, filters.category)
        ];
    }

    return data.filter(res => {
        // 1. Search (Name/Type)
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const name = (res.name || "").toLowerCase();
            const type = (res.type || "").toLowerCase();
            if (!name.includes(term) && !type.includes(term)) return false;
        }

        // 2. Taxonomy (Category) - NOW USES HIERARCHY
        if (validLabels.length > 0) {
            const type = (res.type || "").toLowerCase();
            if (!validLabels.includes(type)) return false;
        }

        // 3. Stats
        for (const [key, val] of Object.entries(filters.stats || {})) {
            if (val && (res[key] == null || res[key] < val)) return false;
        }

        // 4. Planets
        if (filters.planets && filters.planets.length > 0) {
            const resPlanets = Array.isArray(res.planet) ? res.planet : [res.planet];
            if (!resPlanets.some(p => filters.planets.includes(p))) return false;
        }

        // 5. Active Only
        if (filters.activeOnly && !res.is_active) return false;

        return true;
    });
};

export const sortResources = (data, sortStack) => {
    if (!sortStack || sortStack.length === 0) return data;

    return [...data].sort((a, b) => {
        for (let sort of sortStack) {
            const { key, mode } = sort;
            let type = COLUMN_CONFIG[key] || 'numeric';
            
            // Logic match from filters.js:
            // Up = Default Behavior. Down = Inverted.
            let direction = (mode === 'up') ? SORT_BEHAVIOR[type] : (SORT_BEHAVIOR[type] === 'asc' ? 'desc' : 'asc');

            let valA = a[key];
            let valB = b[key];

            // Normalization
            if (type === 'alpha' || type === 'planet') {
                if (Array.isArray(valA)) valA = valA.slice().sort().join(', ');
                if (Array.isArray(valB)) valB = valB.slice().sort().join(', ');
                valA = (valA || "").toLowerCase();
                valB = (valB || "").toLowerCase();
                if (valA !== valB) {
                    return direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                }
            } else {
                let nA = (typeof valA === 'string' && isNaN(valA)) ? Date.parse(valA) : Number(valA);
                let nB = (typeof valB === 'string' && isNaN(valB)) ? Date.parse(valB) : Number(valB);
                if (isNaN(nA)) nA = -1;
                if (isNaN(nB)) nB = -1;
                
                if (nA !== nB) {
                    // direction 'asc' means Low -> High. 'desc' means High -> Low.
                    return direction === 'asc' ? (nA - nB) : (nB - nA);
                }
            }
        }
        return 0;
    });
};