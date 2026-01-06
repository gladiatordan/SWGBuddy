/**
 * Resource Modal Controller
 * Handles 3 Modes: ADD, DETAILS, EDIT
 */

const STAT_MAPPING = {
	'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 'res_fl': 'FL',
	'res_hr': 'HR', 'res_ma': 'MA', 'res_pe': 'PE', 'res_sr': 'SR',
	'res_ut': 'UT', 'res_cr': 'CR'
};

const Modal = {
	mode: 'DETAILS', // ADD, DETAILS, EDIT
	currentResource: null,
	originalData: {},
	isSubmitting: false,
	
	elements: {
		overlay: document.getElementById('resource-modal'),
		title: document.getElementById('modal-title'),
		form: document.getElementById('resource-form'),
		
		// Inputs
		nameGroup: document.querySelector('#res-name').closest('.form-group'), 
		nameInput: document.getElementById('res-name'),
		notesInput: document.getElementById('res-notes'),
		typeInput: document.getElementById('res-type'),
		inputs: {}, 
		
		// Containers
		typeDropdown: document.getElementById('modal-type-dropdown'),
		typeDisplay: document.getElementById('res-type-display'),
		statsEdit: document.getElementById('stats-container-edit'),
		statsView: document.getElementById('stats-container-view'),
		metaContainer: document.getElementById('meta-container'),
		
		// Buttons
		btnEdit: document.getElementById('btn-modal-edit'),
		btnSave: document.getElementById('btn-modal-save'),
		btnCancel: document.getElementById('btn-modal-cancel'),
		
		// Status
		statusBar: document.getElementById('modal-status-bar'),
		loader: document.getElementById('modal-loader')
	},

	init() {
		Object.keys(STAT_MAPPING).forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				this.elements.inputs[id] = el;
				el.addEventListener('input', () => this.checkDirty());
			}
		});

		this.elements.nameInput.addEventListener('input', () => this.checkDirty());
		this.elements.notesInput.addEventListener('input', () => this.checkDirty());

		this.elements.form.addEventListener('submit', (e) => {
			e.preventDefault();
			this.submit();
		});
		
		document.addEventListener('click', (e) => {
			const list = document.getElementById('modal-type-list');
			const searchInput = document.getElementById('modal-type-search');
            const isClickInside = this.elements.typeDropdown.contains(e.target) || (searchInput && searchInput.contains(e.target));
			if (list && list.style.display === 'block' && !isClickInside) {
				list.style.display = 'none';
			}
		});
	},

	// --- ENTRY POINTS ---

	openAdd() {
		this.resetState();
		this.mode = 'ADD';
		this.elements.title.textContent = "Report Resource";
		
		this.populateTypeTree();
		this.renderState();
		this.elements.overlay.classList.remove('hidden');
	},

	openDetails(resource) {
		this.resetState();
		this.mode = 'DETAILS';
		this.currentResource = resource;
		this.originalData = { ...resource }; 
		
		this.populateTypeTree();
		this.populateFields(resource);
		this.renderState();
		this.elements.overlay.classList.remove('hidden');
	},

	enterEditMode() {
		this.mode = 'EDIT';
		this.originalData = this.captureCurrentFormData(); 
		this.renderState();
		this.checkDirty();
	},

	// --- STATE RENDERING ---

	renderState() {
		const els = this.elements;
		const res = this.currentResource || {};
		
		// 1. Header & Visibility
		if (this.mode === 'EDIT') els.title.textContent = `Edit Resource - ${res.name}`;
		else if (this.mode === 'DETAILS') els.title.textContent = `Details - ${res.name}`;
		else els.title.textContent = "Report Resource";

		const isDetails = (this.mode === 'DETAILS');

		// FIX: Hide Name field completely unless in Add Mode
		if (this.mode === 'ADD') {
			els.nameGroup.style.display = 'flex';
			els.nameInput.disabled = false;
		} else {
			els.nameGroup.style.display = 'none';
		}

		// Type
		els.typeDropdown.classList.toggle('hidden', isDetails);
		els.typeDisplay.classList.toggle('hidden', !isDetails);
		if (isDetails) els.typeDisplay.textContent = res.type;

		// Stats
		els.statsEdit.classList.toggle('hidden', isDetails);
		els.statsView.classList.toggle('hidden', !isDetails);
		document.getElementById('stats-label').textContent = isDetails ? "Stats" : "Enter Stats (Stats not applicable to this type are disabled)";
		
		if (isDetails) this.renderStatsView(res);
		else this.updateStatFields(document.getElementById('res-type').value);

		// Meta Data
		els.metaContainer.classList.toggle('hidden', this.mode === 'ADD');
		if (this.mode !== 'ADD') this.renderMetaData(res);

		// Inputs
		els.notesInput.disabled = isDetails;
		els.notesInput.classList.toggle('static-value', isDetails);

		// Buttons
		const canEditRole = window.Auth && Auth.hasPermission('EDITOR');
		
		if (this.mode === 'DETAILS') {
			els.btnEdit.classList.remove('hidden');
			els.btnEdit.disabled = !canEditRole;
			els.btnSave.disabled = true;
			els.btnCancel.disabled = true; 
		} else if (this.mode === 'EDIT') {
			els.btnEdit.classList.remove('hidden');
			els.btnEdit.disabled = true;
			// Save state handled by checkDirty
			els.btnCancel.disabled = false;
		} else { // ADD
			els.btnEdit.classList.add('hidden');
			els.btnSave.disabled = false;
			els.btnCancel.disabled = false;
		}
	},

	renderStatsView(res) {
		const container = this.elements.statsView;
		container.innerHTML = '';
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const val = res[key];
			if (val && val > 0) {
				const rating = res[key + '_rating'] || 0;
				const colorClass = getStatColorClass(rating); 
				const pct = (rating * 100).toFixed(1) + '%';
				
				const div = document.createElement('div');
				div.className = `stat-box ${colorClass}`;
				div.title = `Rating: ${pct}`;
				div.innerHTML = `<label>${STAT_MAPPING[key]}</label><span class="stat-value">${val}</span>`;
				container.appendChild(div);
			}
		});
	},

	renderMetaData(res) {
		// FIX: Display Timestamps correctly
		const dateLabel = res.last_modified_ts ? "Last Modified" : "Date Reported";
		const ts = res.last_modified_ts || res.date_reported_ts || 0;
		
		document.querySelector('#meta-container label').textContent = dateLabel;
		document.getElementById('res-date').textContent = formatDate(ts);
		document.getElementById('res-reporter').textContent = res.reporter_name || "Unknown";
		
		// FIX: Handle 'planet' (DB column) vs 'planets' (Alias)
		const pList = res.planet || res.planets || [];
		const pStr = Array.isArray(pList) ? pList.join(', ') : pList;
		document.getElementById('res-planets').textContent = pStr || "None";
		
		const statusDiv = document.getElementById('res-status');
		statusDiv.innerHTML = `<span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>`;
	},

	populateFields(res) {
		this.elements.nameInput.value = res.name;
		this.elements.notesInput.value = res.notes || "";
		this.elements.typeInput.value = res.type;
		// document.getElementById('modal-type-selected').textContent = res.type;

		const searchInput = document.getElementById('modal-type-search');
        if (searchInput) searchInput.value = res.type;

		Object.keys(STAT_MAPPING).forEach(key => {
			const input = this.elements.inputs[key];
			if (input) input.value = res[key] || "";
		});
	},

	cancel() {
		if (this.mode === 'ADD') {
			this.close();
		} else if (this.mode === 'EDIT') {
			this.openDetails(this.currentResource);
		}
	},

	close() {
		this.elements.overlay.classList.add('hidden');
	},

	async submit() {
		if (this.isSubmitting) return;
		
		for (const [id, input] of Object.entries(this.elements.inputs)) {
			if (!input.disabled && input.value) {
				const val = parseInt(input.value);
				if (isNaN(val) || val < 1 || val > 1000) {
					alert(`${STAT_MAPPING[id]} must be between 1 and 1000.`);
					return;
				}
			}
		}

		try {
			this.isSubmitting = true;
			this.elements.loader.classList.remove('hidden');
			
			const formData = this.captureCurrentFormData();
			
			if (this.mode === 'EDIT') {
				formData.id = this.currentResource.id;
				await API.updateResource(formData);
			} else {
				await API.addResource(formData);
			}

			await loadResources(); 
			
			const freshRes = rawResourceData.find(r => r.name === formData.name);
			if (freshRes) {
				this.openDetails(freshRes);
			} else {
				this.close();
			}

		} catch (error) {
			this.elements.statusBar.textContent = "Error: " + error.message;
			this.elements.statusBar.className = "status-bar status-error";
		} finally {
			this.isSubmitting = false;
			this.elements.loader.classList.add('hidden');
		}
	},

	captureCurrentFormData() {
		const data = {
			name: this.elements.nameInput.value,
			type: this.elements.typeInput.value,
			notes: this.elements.notesInput.value,
			server_id: API.getServerContext()
		};
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const input = this.elements.inputs[key];
			if (input && !input.disabled && input.value) {
				data[key] = parseInt(input.value);
			}
		});
		return data;
	},

	checkDirty() {
		if (this.mode !== 'EDIT') return;
		
		const current = this.captureCurrentFormData();
		let isDirty = false;
		
		if (current.name !== this.originalData.name) isDirty = true;
		if (current.notes !== (this.originalData.notes || "")) isDirty = true;
		if (current.type !== this.originalData.type) isDirty = true;
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const oldVal = this.originalData[key] || "";
			const newVal = current[key] || "";
			if (oldVal.toString() !== newVal.toString()) isDirty = true;
		});

		this.elements.btnSave.disabled = !isDirty;
	},

	// ... Tree Helpers (populateTypeTree, selectType, updateStatFields, toggleDropdown, resetState) ...
	populateTypeTree() {
		const container = document.getElementById('modal-type-dropdown');
		
		// 1. Transform dropdown trigger into a Search Input
		container.innerHTML = `
			<input type="text" 
				id="modal-type-search" 
				class="modal-search-input" 
				placeholder="Search Resource Type..." 
				oninput="Modal.filterTypes(this.value)"
				onfocus="Modal.filterTypes(this.value)">
			<div class="dropdown-list" id="modal-type-list"></div>
		`;
	},

	filterTypes(term) {
		const list = document.getElementById('modal-type-list');
		const termLower = term.toLowerCase();
		
		// Use window.validResources which only contains actual spawnable types
		const matches = Object.keys(window.validResources).filter(type => 
			type.toLowerCase().includes(termLower)
		);

		list.style.display = 'block';
		list.innerHTML = matches.map(type => `
			<div class="dropdown-item selectable" onclick="Modal.selectType('${type}')">
				${type}
			</div>
		`).join('');
		
		if (matches.length === 0) {
			list.innerHTML = '<div class="dropdown-item disabled">No matching types found</div>';
		}
	},

	selectType(label) {
		if (this.mode === 'DETAILS') return; 
		this.elements.typeInput.value = label;
		const searchInput = document.getElementById('modal-type-search');
        if (searchInput) searchInput.value = label;

		document.getElementById('modal-type-list').style.display = 'none';
		this.updateStatFields(label);
		this.checkDirty();
	},

	updateStatFields(label) {
		const config = window.validResources ? window.validResources[label] : null;
		Object.entries(STAT_MAPPING).forEach(([inputId, attrCode]) => {
			const input = this.elements.inputs[inputId];
			if (!input) return;
			const isEnabled = config && config.stats && config.stats.hasOwnProperty(inputId);
			if (isEnabled) {
				input.disabled = false;
				input.placeholder = "";
				input.parentElement.style.opacity = "1";
			} else {
				input.disabled = true;
				input.value = "";
				input.placeholder = "-";
				input.parentElement.style.opacity = "0.3";
			}
		});
	},
	
	toggleDropdown() {
		const list = document.getElementById('modal-type-list');
		list.style.display = list.style.display === 'block' ? 'none' : 'block';
	},
	
	resetState() {
		this.elements.form.reset();
		this.elements.statusBar.textContent = "";
		this.elements.statusBar.className = "status-bar";
		this.elements.loader.classList.add('hidden');
		this.isSubmitting = false;
		const searchInput = document.getElementById('modal-type-search');
        if (searchInput) searchInput.value = "";
	},

	importClipboard: async function() {
		const errorDiv = document.getElementById('paste-error');
		errorDiv.style.display = 'none';

		try {
			// 1. Read Clipboard
			const items = await navigator.clipboard.read();
			let imageBlob = null;

			for (const item of items) {
				// Look for image types
				const type = item.types.find(t => t.startsWith('image/'));
				if (type) {
					imageBlob = await item.getType(type);
					break;
				}
			}

			if (!imageBlob) {
				throw new Error("No image found in clipboard.");
			}

			// 2. Prepare Upload
			this.elements.loader.classList.remove('hidden');
			document.querySelector('.loader-text').textContent = "ANALYZING IMAGE...";

			const formData = new FormData();
			formData.append('image', imageBlob);

			// 3. Send to Backend
			// We use fetch directly here to handle FormData easily, 
			// but manually adding the CSRF header is good practice if your API._fetch does it.
			// Since API._fetch is JSON oriented, we'll do a raw fetch or adapt API.
			const response = await fetch('/api/scan-image', {
				method: 'POST',
				headers: {
					'X-Requested-With': 'XMLHttpRequest' 
				},
				body: formData
			});

			const result = await response.json();
			
			if (!result.success) {
				throw new Error(result.error || "Scan failed");
			}

			// 4. Populate Fields
			const data = result.data;
			
			// Name (Only if currently empty to avoid overwriting user edits)
			if (data.name && !this.elements.nameInput.value) {
				this.elements.nameInput.value = data.name;
			}

			// Stats
			if (data.stats) {
				Object.entries(data.stats).forEach(([key, val]) => {
					const input = this.elements.inputs[key];
					// Only populate if input exists (is compatible with current Type)
					// and is currently empty (don't overwrite manual entry)
					if (input && !input.disabled && !input.value) {
						input.value = val;
					}
				});
			}
			
			// 5. Success Feedback
			this.elements.statusBar.textContent = "Image imported successfully. Please review fields.";
			this.elements.statusBar.className = "status-bar status-success"; // You might need CSS for this class

		} catch (error) {
			console.error("Paste Error:", error);
			errorDiv.textContent = error.message;
			errorDiv.style.display = 'block';
		} finally {
			this.elements.loader.classList.add('hidden');
			document.querySelector('.loader-text').textContent = "PROCESSING..."; // Reset text
		}
	}
};

// Function for the Main Filter
function filterDropdown(input) {
    const term = input.value.toLowerCase();
    const items = input.closest('.dropdown-list').querySelectorAll('.dropdown-item, .branch-container');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        // Toggle visibility based on match
        item.style.display = text.includes(term) ? '' : 'none';
    });
}

// Function for the Modal Tree
function filterModalTree(input) {
    const term = input.value.toLowerCase();
    const nodes = document.querySelectorAll('.modal-tree-node');
    
    nodes.forEach(node => {
        const label = node.querySelector('.modal-tree-label').textContent.toLowerCase();
        const isMatch = label.includes(term);
        // Show the node if it matches, or hide if it doesn't
        node.style.display = isMatch ? '' : 'none';
    });
}

window.filterModalTree = function(input) {
    const term = input.value.toLowerCase();
    // Only select top-level nodes to start the recursion
    const roots = document.querySelectorAll('#modal-type-list > .modal-tree-node'); 

    function processNode(node) {
        const label = node.querySelector('.modal-tree-label').textContent.toLowerCase();
        const childrenContainer = node.querySelector('.modal-tree-children');
        
        let childMatched = false;
        if (childrenContainer) {
             const children = childrenContainer.querySelectorAll(':scope > .modal-tree-node');
             children.forEach(child => {
                 if (processNode(child)) childMatched = true;
             });
        }
        
        const selfMatch = label.includes(term);
        const shouldShow = selfMatch || childMatched;
        
        node.style.display = shouldShow ? 'block' : 'none';
        
        // Auto-expand logic
        if (childMatched && childrenContainer) {
            childrenContainer.classList.remove('collapsed');
            const icon = node.querySelector('.tree-toggle');
            if (icon) icon.innerText = '▼';
        } else if (term === '' && childrenContainer) {
            // Reset to collapsed on clear
            childrenContainer.classList.add('collapsed');
            const icon = node.querySelector('.tree-toggle');
            if (icon) icon.innerText = '▶';
        }
        
        return shouldShow;
    }
    
    roots.forEach(processNode);
};

window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close();
window.Modal = Modal; 

document.addEventListener('DOMContentLoaded', () => Modal.init());