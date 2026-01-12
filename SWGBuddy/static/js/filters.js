/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline.
 */

// Configuration for "Up Arrow" behavior per column type.
// 'asc' = A-Z, 0-9, False-True.
// 'desc' = Z-A, 9-0, True-False.
const SORT_BEHAVIOR = {
	// Name/Type: Up = A-Z (Ascending)
	alpha: 'asc', 
	// Stats/Rating: Up = Highest to Lowest (Descending)
	numeric: 'desc',
	// Date: Up = Most Recent (Large TS) to Oldest (Small TS) (Descending)
	date: 'desc',
	// Status: Up = Active(1) to Inactive(0) (Descending)
	status: 'desc',
	// Location: Up = A-Z string representation (Ascending)
	planet: 'asc'
};

// Map column keys to their type behavior
const COLUMN_CONFIG = {
	name: 'alpha',
	type: 'alpha',
	planet: 'planet',
	date_reported: 'date',
	is_active: 'status',
	// All stats default to 'numeric'
};

const STAT_FILTERS = {
    'f-oq': 'res_oq', 'f-cr': 'res_cr', 'f-cd': 'res_cd', 'f-dr': 'res_dr', 
    'f-fl': 'res_fl', 'f-hr': 'res_hr', 'f-ma': 'res_ma', 'f-pe': 'res_pe', 
    'f-sr': 'res_sr', 'f-ut': 'res_ut'
};

// Initialize Stack: Date (Up) is Primary, Status (Up) is Secondary
// Stack Order: [Primary, Secondary, ...]
let sortStack = [
	{ key: 'date_reported', mode: 'up' }, 
	{ key: 'is_active', mode: 'up' }
];

// Global Toggle for the Taxonomy Filter Dropdown
window.toggleDropdown = function() {
	const list = document.getElementById('taxonomy-list');
	if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
};

document.addEventListener('click', function(event) {
	const dropdown = document.getElementById('taxonomy-dropdown');
	// If we click inside the dropdown (e.g. the search box), DO NOT close it.
	if (dropdown && !dropdown.contains(event.target)) {
		const list = document.getElementById('taxonomy-list');
        if (list) list.style.display = 'none';
	}
});

/**
 * Main Pipeline: Data -> Filter -> Sort -> View
 */
function applyAllTableTransforms() {
	// 1. Filter first (Efficiency)
	applyFilters(); 
	
	// 2. Sort the filtered data
	if (sortStack.length > 0) {
		filteredData.sort(multiColumnComparator);
	}

	// 3. Render
	renderPaginatedTable(); 
}

function applyFilters() {
	const searchInput = document.getElementById('search-input');
	const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
    
    // 1. Get Taxonomy Filter
	const isRoot = !currentSelectedLabel || currentSelectedLabel === "Resources" || currentSelectedLabel === "All Resources";
	const validLabels = isRoot ? [] : [currentSelectedLabel.toLowerCase(), ...getDescendantLabels(currentSelectedLabel)];

    // 2. Get Stat Thresholds
    const activeStatFilters = {};
    for (const [domId, key] of Object.entries(STAT_FILTERS)) {
        const el = document.getElementById(domId);
        if (el && el.value) {
            activeStatFilters[key] = parseInt(el.value);
        }
    }

    // 3. Get Active Planet Filters
    const planetChecks = document.querySelectorAll('.planet-filter:checked');
    const selectedPlanets = Array.from(planetChecks).map(cb => cb.value); // e.g. ["Tatooine", "Naboo"]

    // 4. Get Active Status Filter
    const activeOnly = document.getElementById('filter-active-only')?.checked;

	// Filter raw data
	filteredData = rawResourceData.filter(res => {
        // A. Search
		const name = (res.name || "").toLowerCase();
		const type = (res.type || "").toLowerCase();
		const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
        if (!matchesSearch) return false;
		
        // B. Taxonomy
		const matchesCategory = isRoot || validLabels.includes(type);
        if (!matchesCategory) return false;

        // C. Stat Filters (Greater Than or Equal)
        // Note: If resource value is null/undefined, it fails the check against any positive integer.
        for (const [key, minVal] of Object.entries(activeStatFilters)) {
            const resVal = res[key];
            if (resVal == null || resVal < minVal) return false;
        }

        // D. Planet Filter (OR Logic)
        // If planets are selected, resource MUST exist on at least one of them.
        if (selectedPlanets.length > 0) {
            const resPlanets = res.planet || res.planets || [];
            // Handle both string "Tatooine" and array ["Tatooine"]
            const pList = Array.isArray(resPlanets) ? resPlanets : [resPlanets];
            
            const hasMatch = pList.some(p => selectedPlanets.includes(p));
            if (!hasMatch) return false;
        }

        // E. Active Only
        if (activeOnly && !res.is_active) return false;
		
		return true;
	});
}

/**
 * Comparator that iterates through the sort stack
 */
function multiColumnComparator(a, b) {
	for (let sort of sortStack) {
		const key = sort.key;
		const mode = sort.mode; // 'up' or 'down'
		
		// Determine value type
		let type = COLUMN_CONFIG[key] || 'numeric';
		
		// Determine Asc/Desc based on Up/Down mode and Type config
		// Up = Default Behavior. Down = Inverted.
		let direction = (mode === 'up') ? SORT_BEHAVIOR[type] : (SORT_BEHAVIOR[type] === 'asc' ? 'desc' : 'asc');

		let valA = a[key];
		let valB = b[key];

		// Normalization
		if (type === 'alpha' || type === 'planet') {
			// Handle Planets (Array -> String) or Strings
			if (Array.isArray(valA)) valA = valA.slice().sort().join(', ');
			if (Array.isArray(valB)) valB = valB.slice().sort().join(', ');
			
			valA = (valA || "").toLowerCase();
			valB = (valB || "").toLowerCase();
			
			if (valA !== valB) {
				return direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
			}
		} else {
			// Numeric / Boolean
			// Handle nulls/undefined as -1 (always bottom?) or 0
			let nA = (typeof valA === 'string' && isNaN(valA)) ? Date.parse(valA) : Number(valA);
            let nB = (typeof valB === 'string' && isNaN(valB)) ? Date.parse(valB) : Number(valB);
			
			// Fallback for nulls/NaN to keep them at the bottom
            if (isNaN(nA)) nA = -1;
            if (isNaN(nB)) nB = -1;
			
			if (nA !== nB) {
				return direction === 'asc' ? (nA - nB) : (nB - nA);
			}
		}
	}
	return 0; // Completely equal
}

function selectCategory(label, displayLabel = null) {
    // Default fallback
	// if (!label) label = "All Resources";
    
    // FIX: Update the search input value, not the old div text
    const input = document.getElementById('taxonomy-search-input');
    if (input) {
        // If resetting to root, show "All Resources", otherwise show specific label
        input.value = (label && label !== "Resources" && label !== "All Resources") ? label : "";
    }

	// Set internal state to null for "All Resources" logic
    currentSelectedLabel = (label === "Resources" || label === "All Resources") ? null : label;
    
    // Hide the list
    const list = document.getElementById('taxonomy-list');
	if (list) list.style.display = 'none';
    
	applyAllTableTransforms();
	currentPage = 1;
}

/**
 * Handles the Up -> Down -> Off logic
 */
function toggleSort(key) {
	const idx = sortStack.findIndex(s => s.key === key);
	
	if (idx === -1) {
		// STATE 1: Not Active -> Active UP
		// Add to TOP (Primary)
		sortStack.unshift({ key: key, mode: 'up' });
	} else {
		const current = sortStack[idx];
		if (current.mode === 'up') {
			// STATE 2: UP -> DOWN
			// Maintain position in stack, just flip mode
			current.mode = 'down';
		} else {
			// STATE 3: DOWN -> OFF
			// Remove from stack
			sortStack.splice(idx, 1);
		}
	}

	updateSortVisuals();
	applyAllTableTransforms();
}

function updateSortVisuals() {
	// Clear all visuals
	document.querySelectorAll('.sort-btns span').forEach(el => {
		el.classList.remove('active-up', 'active-down');
	});

	// Apply visuals for ALL active sorts in the stack
	// (Or just primary? Prompt implied "stack". Standard UI usually highlights all involved columns)
	sortStack.forEach((sort, index) => {
		const headerTh = document.querySelector(`th[data-sort="${sort.key}"]`);
		if (headerTh) {
			const upArrow = headerTh.querySelector('.up');
			const downArrow = headerTh.querySelector('.down');
			
			if (sort.mode === 'up' && upArrow) {
				upArrow.classList.add('active-up');
				// Optional: visual indicator of stack priority (1, 2, 3) could go here
			} else if (sort.mode === 'down' && downArrow) {
				downArrow.classList.add('active-down');
			}
		}
	});
}

function clearSearch() {
    const searchInput = document.getElementById('search-input'); // Fixed selector to ID for consistency
    if (searchInput) {
        searchInput.value = '';
        applyAllTableTransforms();
    }
}

const originalApplyTransforms = applyAllTableTransforms;
applyAllTableTransforms = function() {
    // 1. Run the original logic
    originalApplyTransforms();

    // 2. Handle Reset Button Visibility
    const searchInput = document.getElementById('search-input');
    const searchReset = document.getElementById('reset-search');
    
    // Check global currentSelectedLabel for the category reset
    const catReset = document.getElementById('reset-category');

    // Show search reset if text exists
    if (searchReset && searchInput) {
        searchReset.style.display = searchInput.value ? 'block' : 'none';
    }

    // Show category reset if something other than "All Resources" is selected
    if (catReset) {
        const isRoot = !currentSelectedLabel || currentSelectedLabel === "Resources" || currentSelectedLabel === "All Resources";
        catReset.style.display = isRoot ? 'none' : 'block';
    }
};

function clearStat(id) {
    const input = document.getElementById(id);
    if (input) {
        input.value = '';
        applyAllTableTransforms(); // Re-run filters
    }
}