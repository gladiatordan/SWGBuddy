/**
 * Taxonomy Manager
 * Handles the resource tree structure, validity checks, and rendering.
 */
let TAXONOMY_TREE = []; // Array of objects
let RESOURCE_CONFIG = {}; // Map: Label -> {stats, planets}
let VALID_TYPES = new Set(); // Set of Strings (Labels)

async function loadTaxonomy() {
	try {
		// Fetch the single consolidated JSON
		const response = await fetch('/api/taxonomy');
		if (!response.ok) throw new Error("Failed to fetch taxonomy");
		
		TAXONOMY_TREE = await response.json();
		
		// Flatten for O(1) Lookup (Legacy compatibility)
		RESOURCE_CONFIG = {};
		flattenTree(TAXONOMY_TREE);

		// Expose to Global Scope
		window.TAXONOMY_TREE = TAXONOMY_TREE;
		window.validResources = RESOURCE_CONFIG;
		
		console.log(`Taxonomy Loaded. Valid Types: ${Object.keys(RESOURCE_CONFIG).length}`);
		
		renderTaxonomyDropdown();
		return TAXONOMY_TREE;

	} catch (error) {
		console.error("Failed to load taxonomy:", error);
	}
}

function flattenTree(nodes) {
	nodes.forEach(node => {
		if (node.is_valid) {
			RESOURCE_CONFIG[node.label] = {
				id: node.id,
				stats: node.stats || {},
				planets: node.planets || []
			};
		}
		if (node.children && node.children.length > 0) {
			flattenTree(node.children);
		}
	});
}

/**
 * Renders the nested dropdown for filtering.
 */
function renderTaxonomyDropdown() {
    const container = document.getElementById('taxonomy-dropdown');
    if (!container) return;

    // 1. Replace static label with Search Input
    container.innerHTML = `
        <input type="text" 
               id="taxonomy-search-input"
               class="dropdown-search-input" 
               placeholder="Search Category..." 
               onfocus="this.value=''; showTaxonomyResults()"
               oninput="filterTaxonomyResults(this.value)">
        <div class="dropdown-list" id="taxonomy-list"></div>
    `;

    // 2. Pre-generate flattened data for fast searching
    window.FLATTENED_TAXONOMY = flattenTree(window.TAXONOMY_TREE);
}

function filterTaxonomyResults(term) {
    const list = document.getElementById('taxonomy-list');
    term = term.toLowerCase();
    
    // Always show results when typing
    list.style.display = 'block';

    const matches = window.FLATTENED_TAXONOMY.filter(item => 
        item.label.toLowerCase().includes(term)
    );

    // 3. Render flat clickable list
    list.innerHTML = matches.map(item => `
        <div class="dropdown-item" onclick="selectCategory('${item.label}', '${item.label}')">
            ${item.label}
        </div>
    `).join('');

    // Add 'All Resources' option at the top if term is empty
    if (!term) {
        list.insertAdjacentHTML('afterbegin', `
            <div class="dropdown-item root-item" onclick="selectCategory(null, 'All Resources')">
                All Resources
            </div>
        `);
    }
}

/**
 * Returns a flattened list of all descendant labels for a given parent label.
 * Used by filters.js to include children in filter results.
 */
function getDescendantLabels(parentLabel) {
	if (!parentLabel) return [];
	let descendants = [];
	
	function findNode(nodes, target) {
		for (const node of nodes) {
			if (node.label === target) return node;
			if (node.children) {
				const found = findNode(node.children, target);
				if (found) return found;
			}
		}
		return null;
	}

	const parentNode = findNode(TAXONOMY_TREE, parentLabel);
	
	function collect(node) {
		if (node.children) {
			node.children.forEach(child => {
				descendants.push(child.label.toLowerCase());
				collect(child);
			});
		}
	}

	if (parentNode) collect(parentNode);
	return descendants;
}

/**
 * Returns the configuration for a specific resource type.
 * Used by modal.js to enable/disable fields.
 */
function getResourceTypeConfig(label) {
	return RESOURCE_CONFIG[label] || null;
}