/**
 * Taxonomy Manager
 * Handles the resource tree structure, validity checks, and rendering.
 */
let TAXONOMY_TREE = [];
let RESOURCE_CONFIG = {}; 
let FLAT_LIST = []; // New flat list for search

async function loadTaxonomy() {
    try {
        const response = await fetch('/api/taxonomy');
        if (!response.ok) throw new Error("Failed to fetch taxonomy");
        
        TAXONOMY_TREE = await response.json();
        
        // Reset and Flatten
        RESOURCE_CONFIG = {};
        FLAT_LIST = [];
        flattenTree(TAXONOMY_TREE);

        // Expose
        window.TAXONOMY_TREE = TAXONOMY_TREE;
        window.validResources = RESOURCE_CONFIG;
        
        // Initial Render
        renderTaxonomyDropdown();
        return TAXONOMY_TREE;

    } catch (error) {
        console.error("Failed to load taxonomy:", error);
    }
}

// Helper to populate RESOURCE_CONFIG and FLAT_LIST
function flattenTree(nodes) {
    nodes.forEach(node => {
        // Add to config for lookups
        if (node.is_valid) {
            RESOURCE_CONFIG[node.label] = {
                id: node.id,
                stats: node.stats || {},
                planets: node.planets || []
            };
        }
        
        // Add to flat list for the dropdown search
        // We include folders (e.g. "Mineral") so users can select broad categories
        FLAT_LIST.push({ label: node.label, is_valid: node.is_valid });

        if (node.children && node.children.length > 0) {
            flattenTree(node.children);
        }
    });
}

function renderTaxonomyDropdown() {
    const container = document.getElementById('taxonomy-dropdown');
    if (!container) return;

    // Replace the static div with the Input-based structure
    container.innerHTML = `
        <input type="text" 
               id="taxonomy-search-input"
               class="dropdown-search-input" 
               placeholder="Search Type..." 
               autocomplete="off"
               onfocus="showTaxonomyResults(this.value)"
               oninput="showTaxonomyResults(this.value)">
        <div class="dropdown-list" id="taxonomy-list"></div>
    `;
}

// Global function called by the input
window.showTaxonomyResults = function(term) {
    const list = document.getElementById('taxonomy-list');
    const termLower = (term || "").toLowerCase();
    
    list.style.display = 'block';
    list.innerHTML = '';

    // Filter the pre-calculated FLAT_LIST
    const matches = FLAT_LIST.filter(item => 
        item.label.toLowerCase().includes(termLower)
    );

    if (matches.length === 0 && termLower !== '') {
        list.innerHTML = '<div class="dropdown-item" style="color:var(--text-dim)">No matches found</div>';
        return;
    }

    // Render matches
    matches.forEach(item => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.textContent = item.label;
        div.onclick = () => {
            // Update Input Text
            document.getElementById('taxonomy-search-input').value = item.label;
            // Trigger Filter
            selectCategory(item.label, item.label);
            // Hide List
            list.style.display = 'none';
        };
        list.appendChild(div);
    });
};

// Close dropdown if clicking outside
document.addEventListener('click', function(event) {
    const container = document.getElementById('taxonomy-dropdown');
    const list = document.getElementById('taxonomy-list');
    if (container && !container.contains(event.target) && list) {
        list.style.display = 'none';
    }
});

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