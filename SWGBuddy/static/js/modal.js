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
	mode: 'DETAILS',
	currentResource: null,
	originalData: {},
	isSubmitting: false,
	
    // Initialize empty to prevent "element is null" errors during script parse
	elements: {},

	init() {
        // 1. Cache DOM Elements (Safe because DOM is now loaded)
        this.cacheDOM();

        // 2. Attach Listeners only if elements exist
        if (this.elements.inputs) {
            Object.keys(STAT_MAPPING).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    this.elements.inputs[id] = el;
                    el.addEventListener('input', () => this.checkDirty());
                }
            });
        }

        if (this.elements.nameInput) {
		    this.elements.nameInput.addEventListener('input', () => this.checkDirty());
        }
        
        if (this.elements.notesInput) {
		    this.elements.notesInput.addEventListener('input', () => this.checkDirty());
        }

        if (this.elements.form) {
            this.elements.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submit();
            });
        }
		
		document.addEventListener('click', (e) => {
            if (!this.elements.typeDropdown) return;
            
			const list = document.getElementById('modal-type-list');
			const searchInput = document.getElementById('modal-type-search');
            // Safe check for containment
            const isClickInside = this.elements.typeDropdown.contains(e.target) || (searchInput && searchInput.contains(e.target));
            
			if (list && list.style.display === 'block' && !isClickInside) {
				list.style.display = 'none';
			}
		});
	},

    // New Helper to safely fetch elements
    cacheDOM() {
        const nameInput = document.getElementById('res-name');
        
        this.elements = {
            overlay: document.getElementById('resource-modal'),
            title: document.getElementById('modal-title'),
            form: document.getElementById('resource-form'),
            
            // Inputs
            // Safe navigation: check if input exists before finding closest group
            nameGroup: nameInput ? nameInput.closest('.form-group') : null, 
            nameInput: nameInput,
            notesInput: document.getElementById('res-notes'),
            typeInput: document.getElementById('res-type'),
            inputs: {}, // Populated in init loop
            
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
        };
    },

	// --- ENTRY POINTS ---

	openAdd() {
		this.resetState();
		this.mode = 'ADD';
		if (this.elements.title) this.elements.title.textContent = "Report Resource";
		
		this.populateTypeTree();
		this.renderState();
		if (this.elements.overlay) this.elements.overlay.classList.remove('hidden');
	},

	openDetails(resource) {
		this.resetState();
		this.mode = 'DETAILS';
		this.currentResource = resource;
		this.originalData = { ...resource }; 
		
		this.populateTypeTree();
		this.populateFields(resource);
		this.renderState();
		if (this.elements.overlay) this.elements.overlay.classList.remove('hidden');
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
        if (els.title) {
            if (this.mode === 'EDIT') els.title.textContent = `Edit Resource - ${res.name}`;
            else if (this.mode === 'DETAILS') els.title.textContent = `Details - ${res.name}`;
            else els.title.textContent = "Report Resource";
        }

		const isDetails = (this.mode === 'DETAILS');

		// FIX: Hide Name field completely unless in Add Mode
		if (this.mode === 'ADD') {
			if (els.nameGroup) els.nameGroup.style.display = 'flex';
			if (els.nameInput) els.nameInput.disabled = false;
		} else {
			if (els.nameGroup) els.nameGroup.style.display = 'none';
		}

		// Type
		if (els.typeDropdown) els.typeDropdown.classList.toggle('hidden', isDetails);
		if (els.typeDisplay) {
            els.typeDisplay.classList.toggle('hidden', !isDetails);
            if (isDetails) els.typeDisplay.textContent = res.type;
        }

		// Stats
		if (els.statsEdit) els.statsEdit.classList.toggle('hidden', isDetails);
		if (els.statsView) els.statsView.classList.toggle('hidden', !isDetails);
        
        const statsLabel = document.getElementById('stats-label');
		if (statsLabel) statsLabel.textContent = isDetails ? "Stats" : "Enter Stats (Stats not applicable to this type are disabled)";
		
		if (isDetails) this.renderStatsView(res);
		else {
            const typeVal = document.getElementById('res-type');
            if (typeVal) this.updateStatFields(typeVal.value);
        }

		// Meta Data
		if (els.metaContainer) {
            els.metaContainer.classList.toggle('hidden', this.mode === 'ADD');
            if (this.mode !== 'ADD') this.renderMetaData(res);
        }

		// Inputs
        if (els.notesInput) {
            els.notesInput.disabled = isDetails;
            els.notesInput.classList.toggle('static-value', isDetails);
        }

		// Buttons
		const canEditRole = window.Auth && Auth.hasPermission('EDITOR');
		
		if (this.mode === 'DETAILS') {
			if (els.btnEdit) {
                els.btnEdit.classList.remove('hidden');
                els.btnEdit.disabled = !canEditRole;
            }
			if (els.btnSave) els.btnSave.disabled = true;
			if (els.btnCancel) els.btnCancel.disabled = true; 
		} else if (this.mode === 'EDIT') {
			if (els.btnEdit) {
                els.btnEdit.classList.remove('hidden');
                els.btnEdit.disabled = true;
            }
			// Save state handled by checkDirty
			if (els.btnCancel) els.btnCancel.disabled = false;
		} else { // ADD
			if (els.btnEdit) els.btnEdit.classList.add('hidden');
			if (els.btnSave) els.btnSave.disabled = false;
			if (els.btnCancel) els.btnCancel.disabled = false;
		}
	},

	renderStatsView(res) {
		const container = this.elements.statsView;
        if (!container) return;
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
		const dateLabel = res.last_modified_ts ? "Last Modified" : "Date Reported";
		const ts = res.last_modified_ts || res.date_reported_ts || 0;
		
        const metaLabel = document.querySelector('#meta-container label');
		if (metaLabel) metaLabel.textContent = dateLabel;
        
		const dateEl = document.getElementById('res-date');
        if (dateEl) dateEl.textContent = formatDate(ts);
        
        const repEl = document.getElementById('res-reporter');
        if (repEl) repEl.textContent = res.reporter_name || "Unknown";
		
		const pList = res.planet || res.planets || [];
		const pStr = Array.isArray(pList) ? pList.join(', ') : pList;
        const planetEl = document.getElementById('res-planets');
		if (planetEl) planetEl.textContent = pStr || "None";
		
		const statusDiv = document.getElementById('res-status');
		if (statusDiv) statusDiv.innerHTML = `<span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>`;
	},

	populateFields(res) {
        if (this.elements.nameInput) this.elements.nameInput.value = res.name;
		if (this.elements.notesInput) this.elements.notesInput.value = res.notes || "";
		if (this.elements.typeInput) this.elements.typeInput.value = res.type;

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
		if (this.elements.overlay) this.elements.overlay.classList.add('hidden');
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
            if (this.elements.loader) this.elements.loader.classList.remove('hidden');
			
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
            if (this.elements.statusBar) {
			    this.elements.statusBar.textContent = "Error: " + error.message;
			    this.elements.statusBar.className = "status-bar status-error";
            }
		} finally {
			this.isSubmitting = false;
			if (this.elements.loader) this.elements.loader.classList.add('hidden');
		}
	},

	captureCurrentFormData() {
		const data = {
			name: this.elements.nameInput ? this.elements.nameInput.value : "",
			type: this.elements.typeInput ? this.elements.typeInput.value : "",
			notes: this.elements.notesInput ? this.elements.notesInput.value : "",
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

        if (this.elements.btnSave) this.elements.btnSave.disabled = !isDirty;
	},

	// ... Tree Helpers (populateTypeTree, selectType, updateStatFields, toggleDropdown, resetState) ...
	populateTypeTree() {
		const container = document.getElementById('modal-type-dropdown');
        if (!container) return;
		
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
        if (!list) return;
		const termLower = term.toLowerCase();
		
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
		if (this.elements.typeInput) this.elements.typeInput.value = label;
		const searchInput = document.getElementById('modal-type-search');
        if (searchInput) searchInput.value = label;

		const list = document.getElementById('modal-type-list');
        if (list) list.style.display = 'none';
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
		if (list) list.style.display = list.style.display === 'block' ? 'none' : 'block';
	},
	
	resetState() {
		if (this.elements.form) this.elements.form.reset();
		if (this.elements.statusBar) {
            this.elements.statusBar.textContent = "";
		    this.elements.statusBar.className = "status-bar";
        }
		if (this.elements.loader) this.elements.loader.classList.add('hidden');
		this.isSubmitting = false;
		const searchInput = document.getElementById('modal-type-search');
        if (searchInput) searchInput.value = "";
	},

	importClipboard: async function() {
		const errorDiv = document.getElementById('paste-error');
		if (errorDiv) errorDiv.style.display = 'none';

		try {
			const items = await navigator.clipboard.read();
			let imageBlob = null;

			for (const item of items) {
				const type = item.types.find(t => t.startsWith('image/'));
				if (type) {
					imageBlob = await item.getType(type);
					break;
				}
			}

			if (!imageBlob) {
				throw new Error("No image found in clipboard.");
			}

			if (this.elements.loader) this.elements.loader.classList.remove('hidden');
			const loaderText = document.querySelector('.loader-text');
            if (loaderText) loaderText.textContent = "ANALYZING IMAGE...";

			const formData = new FormData();
			formData.append('image', imageBlob);

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

			const data = result.data;
			
			if (data.name && this.elements.nameInput && !this.elements.nameInput.value) {
				this.elements.nameInput.value = data.name;
			}

			if (data.stats) {
				Object.entries(data.stats).forEach(([key, val]) => {
					const input = this.elements.inputs[key];
					if (input && !input.disabled && !input.value) {
						input.value = val;
					}
				});
			}
			
			if (this.elements.statusBar) {
                this.elements.statusBar.textContent = "Image imported successfully. Please review fields.";
			    this.elements.statusBar.className = "status-bar status-success";
            }

		} catch (error) {
			console.error("Paste Error:", error);
            if (errorDiv) {
			    errorDiv.textContent = error.message;
			    errorDiv.style.display = 'block';
            }
		} finally {
			if (this.elements.loader) this.elements.loader.classList.add('hidden');
			const loaderText = document.querySelector('.loader-text');
            if (loaderText) loaderText.textContent = "PROCESSING..."; 
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

// Initializer handles the calls after DOM is ready
document.addEventListener('DOMContentLoaded', () => Modal.init());