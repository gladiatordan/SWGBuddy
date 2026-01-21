// Data & Formatting Utilities

export const STAT_MAPPING = {
    'res_quality': 'OQ',
    'res_cold_resist': 'CR',
    'res_conductivity': 'CD',
    'res_decay_resist': 'DR',
    'res_flavor': 'FL',
    'res_heat_resist': 'HR',
    'res_malleability': 'MA',
    'res_potential_energy': 'PE',
    'res_shock_resistance': 'SR',
    'res_toughness': 'UT'
    // 'entangle_resistance': 'ER'
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

export const formatResourceDate = (rawDate) => {
    if (!rawDate) return '-';
    
    // Original Logic: Check if seconds or milliseconds
    const dObj = (!isNaN(rawDate) && rawDate < 1e12) 
                 ? new Date(rawDate * 1000) 
                 : new Date(rawDate);

    if (isNaN(dObj.getTime())) return 'Invalid Date';

    const day = String(dObj.getUTCDate()).padStart(2, '0');
    const month = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const year = dObj.getUTCFullYear();
    
    return `${day}/${month}/${year}`; // Matches original format
};

// --- FILTERING & SORTING LOGIC ---
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

export const filterResources = (data, filters) => {
    if (!data) return [];
    
    return data.filter(res => {
        // 1. Search (Name match)
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const name = (res.name || "").toLowerCase();
            // Note: If you want to search by Type label text here, you'd need a lookup map.
            // For now, checking name is standard.
            if (!name.includes(term)) return false;
        }

        // 2. Taxonomy (Hierarchical ID Check)
        // filters.category is now the class_tree string (e.g., "1.2.3")
        if (filters.category) {
            if (!res.class_tree) return false;
            // "1.2.3" should match "1.2.3" AND "1.2.3.4"
            // We append a dot to ensure "1.2" doesn't match "1.20"
            const prefix = filters.category + '.';
            const exact = filters.category === res.class_tree;
            const descendant = res.class_tree.startsWith(prefix);
            
            if (!exact && !descendant) return false;
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

export const findTaxonomyNode = (nodes, label) => {
    if (!nodes || !Array.isArray(nodes)) return null;

    for (const node of nodes) {
        if (node.label === label) return node;
        if (node.children) {
            const found = findTaxonomyNode(node.children, label);
            if (found) return found;
        }
    }
    return null;
};