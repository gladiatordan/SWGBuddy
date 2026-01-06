/**
 * Table & Pagination Component
 * Handles rendering the resource log and navigation controls
 */

function renderTable(data) {
	const tableBody = document.getElementById('resource-log-body');
	tableBody.innerHTML = '';

	const canEdit = window.Auth && Auth.hasPermission('EDITOR');

	let allPlanets = window.ALL_PLANETS || [];
	if (allPlanets.length === 0 && window.validResources) {
		const set = new Set();
		Object.values(window.validResources).forEach(r => {
			if (r.planets) r.planets.forEach(p => set.add(p));
		});
		allPlanets = Array.from(set).sort();
	}

	const statPairs = [
			['res_oq', 'res_oq_rating'],
			['res_cr', 'res_cr_rating'],
			['res_cd', 'res_cd_rating'],
			['res_dr', 'res_dr_rating'],
			['res_fl', 'res_fl_rating'],
			['res_hr', 'res_hr_rating'],
			['res_ma', 'res_ma_rating'],
			['res_pe', 'res_pe_rating'],
			['res_sr', 'res_sr_rating'],
			['res_ut', 'res_ut_rating']
		];

	data.forEach(res => {
		const row = document.createElement('tr');
		const safeName = res.name.replace(/['\s]/g, '-');

		// const rawDate = new Date(res.date_reported);
		const dObj = (!isNaN(res.date_reported) && res.date_reported < 1e12) 
					 ? new Date(res.date_reported * 1000) 
					 : new Date(res.date_reported);

		const day = String(dObj.getUTCDate()).padStart(2, '0')
		const month = String(dObj.getUTCMonth() + 1).padStart(2, '0')
		const year = dObj.getUTCFullYear();
		const formattedDate = `${day}/${month}/${year}`;

		// Planet Logic
		const rawPlanets = res.planet || res.planets || [];
		
		// FIX: Sort planets alphabetically for display consistency
		const sortedPlanets = rawPlanets.slice().sort((a, b) => a.localeCompare(b));
		const assignedPlanetsLower = sortedPlanets.map(p => p.toLowerCase());
		
		let planetControlHtml = '';
		if (canEdit) {
			const resourceConfig = window.validResources && window.validResources[res.type];
			const allowedPlanets = resourceConfig ? resourceConfig.planets : allPlanets;
			const availableOptions = allowedPlanets
				.filter(p => !assignedPlanetsLower.includes(p.toLowerCase()))
				.sort()
				.map(p => `<option value="${p}">${p}</option>`)
				.join('');
			
			// Hide button if no options available
			if (availableOptions.length > 0) {
				planetControlHtml = `
					<div class="planet-controls">
						<select class="planet-select" onchange="togglePlanet(this, '${res.name.replace(/'/g, "\\'")}')">
							<option value="" disabled selected>+</option>
							${availableOptions}
						</select>
					</div>`;
			}
			// planetControlHtml = `
			// 	<div class="planet-controls">
			// 		<select class="planet-select" onchange="togglePlanet(this, '${res.name.replace(/'/g, "\\'")}')">
			// 			<option value="" disabled selected>+</option>
			// 			${availableOptions}
			// 		</select>
			// 	</div>`;
		}

		// Generate badges from the sorted list and display full name
		const planetBadges = sortedPlanets.map(p => {
			const planetLower = p.toLowerCase();
			const clickAttr = canEdit
				? `onclick="handleBadgeClick(event, '${res.name.replace(/'/g, "\\'")}', '${p}')" style="cursor: pointer;"` 
        		: '';

			return `<span class="planet ${planetLower}" 
							data-tooltip="${p}" 
							${clickAttr}>
							${p.charAt(0)}
					</span>`;
		}).join(' ');
		
		row.id = `row-${safeName}`;
		row.onclick = () => highlightRow(row);

		const weightColor = getStatColorClass(res.res_weight_rating);

		const statCells = statPairs.map(([valKey, ratKey]) => {
			const rawVal = res[valKey];
			const rating = res[ratKey]; 
			const isEmpty = rawVal === null || rawVal === undefined || rawVal === '-';
			const displayVal = isEmpty ? '-' : rawVal;
			const colorClass = getStatColorClass(rating);
			
			let tooltipAttr = '';
			if (!isEmpty && rating !== null && rating !== undefined) {
				const pct = (rating * 100).toFixed(1) + '%';
				tooltipAttr = `title="Rating: ${pct}"`;
			}

			return `<td class="col-stat ${colorClass}" ${tooltipAttr}>${displayVal}</td>`;
		}).join('');

		let statusHtml = `
			<span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>
		`;
		if (canEdit) {
			statusHtml += `<button class="toggle-status-btn" data-tooltip="Toggle Status" onclick="toggleStatus(this, '${res.name.replace(/'/g, "\\'")}')"></button>`;
		}

		row.innerHTML = `
			<td class="res-name">
				<a class="res-link" onclick="openResourceModal('${res.name.replace(/'/g, "\\'")}')">${res.name}</a>
			</td>
			<td class="res-type">${res.type}</td>
			<td class="col-stat ${weightColor}">${parseInt(res.res_weight_rating * 1000)}</td>
			${statCells}
			<td class="col-loc">
				<div class="planets-container">${planetBadges}</div>
				${planetControlHtml}
			</td>
			<td class="col-date">${formattedDate}</td>
			<td class="col-status">
				<div class="status-container">
					${statusHtml}
				</div>
			</td>
		`;
		tableBody.appendChild(row);

		if (res.name === selectedResourceName) {
			row.classList.add('highlighted-row');
		}
	});
}

// ... (Rest of pagination functions remain unchanged)
function renderPaginatedTable() {
	const start = (currentPage - 1) * resultsPerPage;
	const end = start + resultsPerPage;
	const paginatedData = filteredData.slice(start, end);
	renderTable(paginatedData);
	renderPageNumbers();
}

function renderPageNumbers() {
    // Calculate total pages
	const totalPages = Math.ceil(filteredData.length / resultsPerPage) || 1;
	
    // 1. Update the Display Text (e.g. "1 / 15")
	const pageDisplay = document.getElementById('page-display');
    if (pageDisplay) {
        pageDisplay.textContent = `${currentPage} / ${totalPages}`;
    }

    // 2. Update Button States (Safely check if they exist first)
	const btnFirst = document.getElementById('btn-first');
	const btnPrev = document.getElementById('btn-prev');
	const btnNext = document.getElementById('btn-next');
	const btnLast = document.getElementById('btn-last');

    if (btnFirst) btnFirst.disabled = (currentPage === 1);
	if (btnPrev) btnPrev.disabled = (currentPage === 1);
	if (btnNext) btnNext.disabled = (currentPage === totalPages);
	if (btnLast) btnLast.disabled = (currentPage === totalPages);
}

function goToPage(destination) {
	const totalPages = Math.ceil(filteredData.length / resultsPerPage) || 1; // Ensure at least 1 page

	if (destination === 'first') currentPage = 1;
	else if (destination === 'last') currentPage = totalPages;
	else if (destination === 'prev') currentPage = Math.max(1, currentPage - 1);
	else if (destination === 'next') currentPage = Math.min(totalPages, currentPage + 1);
	else currentPage = parseInt(destination);

	renderPaginatedTable();
}

function changeResultsPerPage() {
	resultsPerPage = parseInt(document.getElementById('results-per-page').value);
	currentPage = 1;
	applyAllTableTransforms();
}

function highlightRow(rowElement, resourceName) {
	document.querySelectorAll('.resource-table tr.highlighted-row').forEach(row => {
		row.classList.remove('highlighted-row');
	});
	if (rowElement) {
		rowElement.classList.add('highlighted-row');
		selectedResourceName = resourceName;
	}
}