import React, { useState, useMemo, useEffect } from 'react';
import { useResources } from '../../hooks/useResources';
import { useAuth } from '../../contexts/AuthContext';
import { filterResources, sortResources, STAT_MAPPING } from '../../utils/resourceUtils';
import ResourceRow from './ResourceRow';
import TaxonomySearch from '../Common/TaxonomySearch';
import ResourceModal from '../Modals/ResourceModal';
import Loader from '../Common/Loader';

const ResourceList = () => {
    const { resources, cache, loading, actions } = useResources();
    const { hasPermission } = useAuth();
    const isEditor = hasPermission('EDITOR');
	const isAdmin = hasPermission('ADMIN');

	const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);

    const handleAddClick = () => {
        setSelectedResource(null); // Null means Add Mode
        setIsModalOpen(true);
    };

	const handleRowClick = (resource) => {
        setSelectedResource(resource);
        setIsModalOpen(true);
    };

    // --- Critical Update: Async Wait for Sync ---
    const handleModalSave = async () => {
        await actions.refresh(); // Refresh the table after save
    };

    // --- View State ---
    const [filters, setFilters] = useState({
        search: '',
        category: null,
        stats: {}, 
        planets: [],
        activeOnly: false
    });
    
    // Sort Stack: Default to Date Reported (Descending/Up logic depending on your utils)
    const [sortStack, setSortStack] = useState([{ key: 'date_reported', mode: 'up' }]);
    const [page, setPage] = useState(1);
    const [resultsPerPage, setResultsPerPage] = useState(50);

	// --- Export State ---
    const [exportScope, setExportScope] = useState('filtered'); // 'all', 'filtered', 'page'
    const [exportFormat, setExportFormat] = useState('csv'); // 'csv', 'json'

    // --- Sort Handlers ---

    // Helper: Returns 'active-up', 'active-down', or '' for a given column key
    const getSortStatus = (key) => {
        const sort = sortStack.find(s => s.key === key);
        if (!sort) return { up: '', down: '' };
        return {
            up: sort.mode === 'up' ? 'active-up' : '',
            down: sort.mode === 'down' ? 'active-down' : ''
        };
    };

    const handleSort = (key) => {
        setSortStack(prev => {
            const idx = prev.findIndex(s => s.key === key);
            
            // 1. New Sort -> Add to Top
            if (idx === -1) {
                return [{ key, mode: 'up' }, ...prev];
            }

            // 2. Existing Sort -> Toggle In-Place or Remove
            const current = prev[idx];
            const newStack = [...prev];

            if (current.mode === 'up') {
                // Toggle to Down (Stay in place)
                newStack[idx] = { ...current, mode: 'down' };
                return newStack;
            } else {
                // Remove (Restore previous order of remaining items)
                newStack.splice(idx, 1);
                return newStack;
            }
        });
    };

    const handleStatChange = (key, value) => {
       // Clamp Logic: 0 to 1000
        let val = value === '' ? null : parseInt(value, 10);
        
        if (val !== null) {
            if (isNaN(val)) val = null;
            else val = Math.max(0, Math.min(1000, val));
        }

        setFilters(prev => ({
            ...prev,
            stats: { ...prev.stats, [key]: val }
        }));
    };

    const handlePlanetToggle = (planet) => {
        setFilters(prev => {
            const current = prev.planets;
            if (current.includes(planet)) return { ...prev, planets: current.filter(p => p !== planet) };
            return { ...prev, planets: [...current, planet] };
        });
    };

	// --- DEEP LINKING LOGIC ---
    useEffect(() => {
        // Only run if resources are loaded
        if (loading || !resources.length) return;

        const params = new URLSearchParams(window.location.search);
        const linkedName = params.get('resource');

        if (linkedName) {
            const found = resources.find(r => r.name.toLowerCase() === linkedName.toLowerCase());
            if (found) {
                handleRowClick(found);
                
                // Optional: Clean up URL after opening (removes ?resource=... but keeps ?server=...)
                params.delete('resource');
                window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            }
        }
    }, [resources, loading]); // Dependency on resources ensures this runs once data arrives

    // --- Data Pipeline ---
    const processedData = useMemo(() => {
        // filterResources no longer needs the 3rd arg (taxonomy)
        let data = filterResources(resources, filters); 
        data = sortResources(data, sortStack);
        return data;
    }, [resources, filters, sortStack]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / resultsPerPage) || 1;
    const paginatedData = processedData.slice((page - 1) * resultsPerPage, page * resultsPerPage);

	// --- Export Handler ---
    const handleExport = () => {
        // 1. Determine Dataset
        let dataToExport = [];
        if (exportScope === 'all') {
            dataToExport = resources;
        } else if (exportScope === 'filtered') {
            dataToExport = processedData;
        } else if (exportScope === 'page') {
            dataToExport = paginatedData;
        }

        if (!dataToExport || dataToExport.length === 0) {
            alert("No data to export.");
            return;
        }

        // 2. Format Data
        let content = "";
        let filename = `swgbuddy_export_${new Date().toISOString().slice(0, 10)}`;
        let mimeType = "";

        if (exportFormat === 'json') {
            content = JSON.stringify(dataToExport, null, 2);
            filename += ".json";
            mimeType = "application/json";
        } else {
            // CSV
            filename += ".csv";
            mimeType = "text/csv";

            // Headers: Name, Type, Stats..., Planet, Date, Active, Notes
            const statKeys = Object.keys(STAT_MAPPING);
            const statLabels = Object.values(STAT_MAPPING);
            const headers = ['Name', 'Type', ...statLabels, 'Planets', 'Date', 'Active', 'Notes'];

            const rows = dataToExport.map(res => {
                const stats = statKeys.map(k => res[k] !== null && res[k] !== undefined ? res[k] : "");
                
                // Format Planet (array to pipe-delimited string)
                let planets = "";
                if (Array.isArray(res.planet)) planets = res.planet.join(" | ");
                else if (res.planet) planets = String(res.planet);

                // Format Date
                let dateStr = "";
                if (res.date_reported) {
                    try {
                        dateStr = new Date(res.date_reported).toISOString().split('T')[0];
                    } catch (e) { dateStr = String(res.date_reported); }
                }

                // Escape CSV Function
                const escape = (val) => {
                    const str = String(val || "");
                    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                const fields = [
                    res.name,
                    res.type,
                    ...stats,
                    planets,
                    dateStr,
                    res.is_active ? "Yes" : "No",
                    res.notes
                ];

                return fields.map(escape).join(",");
            });

            content = [headers.join(","), ...rows].join("\n");
        }

        // 3. Trigger Download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (loading && resources.length === 0) {
        return <div style={{textAlign: 'center', padding: '50px', color: 'var(--accent-blue)'}}>LOADING DATAPAD...</div>;
    }

    // Helper component for Sort Arrows to keep the JSX clean
    const SortArrows = ({ colKey }) => {
        const status = getSortStatus(colKey);
        return (
            <div className="sort-btns">
                <span className={`up ${status.up}`}>▲</span>
                <span className={`down ${status.down}`}>▼</span>
            </div>
        );
    };

	if (loading) {
        return (
            <section id="resources-container" className="page-container active">
                <Loader message="SYNCING DATAPAD..." />
            </section>
        );
    }

	const statColumns = [
        { label: 'OQ', key: 'res_quality' },
        { label: 'CR', key: 'res_cold_resist' },
        { label: 'CD', key: 'res_conductivity' },
        { label: 'DR', key: 'res_decay_resist' },
        { label: 'FL', key: 'res_flavor' },
        { label: 'HR', key: 'res_heat_resist' },
        { label: 'MA', key: 'res_malleability' },
        { label: 'PE', key: 'res_potential_energy' },
        { label: 'SR', key: 'res_shock_resistance' },
        { label: 'UT', key: 'res_toughness' }
    ];

    return (
        <section id="resources-container" className="page-container active">
            <div className="filters-layout-grid">
                
                {/* 1. Add Button */}
                <div className="filter-col-add">
                    {isEditor && (
                        <button className="add-resource-btn" onClick={handleAddClick}>
                            <i className="fa-solid fa-plus"></i> Add Resource
                        </button>
                    )}
                </div>

                {/* 2. Search Row & Export Section */}
                <div className="filter-col-search">
                    {/* NEW EXPORT SECTION (Admin Only) */}
                    {isAdmin && (
                        <div style={{marginBottom: '2px', paddingBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                            <span style={{display:'block', paddingBottom: '10px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif", color: 'var(--accent-blue)'}}>
                                Export Resources
                            </span>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap'}}>
                                <select 
                                    className="results-select" 
                                    style={{minWidth: '150px'}}
                                    value={exportScope}
                                    onChange={(e) => setExportScope(e.target.value)}
                                >
                                    <option value="all">All Resources</option>
                                    <option value="filtered">Filtered Selection</option>
                                    <option value="page">Current Page</option>
                                </select>
                                <select 
                                    className="results-select"
                                    style={{minWidth: '100px'}}
                                    value={exportFormat}
                                    onChange={(e) => setExportFormat(e.target.value)}
                                >
                                    <option value="csv">CSV</option>
                                    <option value="json">JSON</option>
                                </select>
                                <button 
                                    className="page-nav-btn" 
                                    onClick={handleExport}
                                    title="Download"
                                    style={{padding: '0 20px', height: '22px', borderRadius: '4px'}}
                                >
                                    <i className="fa-solid fa-download"></i>
                                </button>
                            </div>
                        </div>
                    )}

					<span style={{textAlign: 'left', display:'block', paddingBottom: '10px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif", color: 'var(--accent-blue)'}}>
                        Filter By Name
                    </span>
                    <div className="search-row">
						<div className="search-inputs-container">
							<div className="filter-input-wrapper">
								<input 
									type="text" 
									placeholder="Search Name..." 
									className="search-input"
									value={filters.search}
									onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
								/>
								{filters.search && (
									<button 
										className="reset-filter-btn" 
										onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
									>
										<i className="fa-solid fa-times"></i>
									</button>
								)}
							</div>

							<TaxonomySearch 
								options={cache?.filter_list || {}} 
								value={filters.category}
								onChange={(cat) => setFilters(prev => ({ ...prev, category: cat }))}
								onlyValid={false}
								placeholder="Search Type..."
							/>

							<div className="active-toggle-inline">
								<label className="toggle-label" title="Show Active Only">
									<input 
										type="checkbox" 
										checked={filters.activeOnly}
										onChange={(e) => setFilters(prev => ({ ...prev, activeOnly: e.target.checked }))} 
									/>
									Show Active Only
								</label>
							</div>
						</div>
                    </div>
                </div>

                {/* 3. Stats */}
                <div className="filter-col-stats">
                    <span style={{paddingBottom: '45px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif", color: 'var(--accent-blue)'}}>
                        Filter By Stats
                    </span>
                    <div className="stats-grid-wrapper">
                        {Object.entries(STAT_MAPPING).map(([key, label]) => {
                            const val = filters.stats[key] || '';
                            return (
                                <div className="stat-input-wrapper" key={key}>
                                    <input 
                                        type="number" 
                                        placeholder={label} 
                                        className="stat-filter-input"
                                        value={val}
                                        onChange={(e) => handleStatChange(key, e.target.value)}
                                    />
                                    {/* Added Clear Button */}
                                    {val && (
                                        <span 
                                            className="stat-clear" 
                                            onClick={() => handleStatChange(key, '')}
                                        >
                                            &times;
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Planets */}
                <div className="filter-col-planets">
                    <span style={{paddingBottom: '25px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif", color: 'var(--accent-blue)'}}>
                        Filter By Planet
                    </span>
                    <div className="planets-grid-wrapper">
                        {["Corellia", "Dantooine", "Dathomir", "Endor", "Lok", "Naboo", "Rori", "Talus", "Tatooine", "Yavin", "Mustafar", "Kashyyyk"].map(p => (
                            <label className="planet-check" title={p} key={p}>
                                <input 
                                    type="checkbox" 
                                    className="planet-filter" 
                                    value={p}
                                    checked={filters.planets.includes(p)}
                                    onChange={() => handlePlanetToggle(p)} 
                                /> 
                                <span>{p}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* 5. Pagination */}
                <div className="filter-col-page">
                    <div className="pagination-stack">
						<span style={{paddingBottom: '25px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif", color: 'var(--accent-blue)'}}>
                        Page Control
                    	</span>
                        <div className="pagination-controls">
                            <label htmlFor="results-per-page" style={{whiteSpace: 'nowrap'}}>Show Results:</label>
                            <select 
                                id="results-per-page" 
                                className="results-select" 
                                value={resultsPerPage}
                                onChange={(e) => { setResultsPerPage(Number(e.target.value)); setPage(1); }}
                            >
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <div className="page-nav-container">
                            <button className="page-nav-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                            <span style={{fontSize: '12px', color: 'var(--accent-blue)'}}>{page} / {totalPages}</span>
                            <button className="page-nav-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- TABLE --- */}
            <div className="table-scroll-wrapper">
                <table className="resource-table">
                    <thead>
                        <tr>
                            <th className="col-name" onClick={() => handleSort('name')}>
                                <div className="sort-wrapper left">
                                    <span>NAME </span>
                                    <SortArrows colKey="name" />
                                </div>
                            </th>
                            <th className="col-type" onClick={() => handleSort('type')}>
                                <div className="sort-wrapper left">
                                    <span>TYPE </span>
                                    <SortArrows colKey="type" />
                                </div>
                            </th>
                            <th className="col-stat" onClick={() => handleSort('res_weight_rating')}>
                                <div className="sort-wrapper center">
                                    <span>Rating</span>
                                    <SortArrows colKey="res_weight_rating" />
                                </div>
                            </th>
                            {statColumns.map(({ label, key }) => (
                                <th key={label} className="col-stat" onClick={() => handleSort(key)}>
                                    <div className="sort-wrapper center">
                                        <span>{label}</span>
                                        <SortArrows colKey={key} />
                                    </div>
                                </th>
                            ))}
                            <th className="col-loc">LOCATION</th>
                            <th className="col-date" onClick={() => handleSort('date_reported')}>
                                <div className="sort-wrapper center">
                                    <span>DATE</span>
                                    <SortArrows colKey="date_reported" />
                                </div>
                            </th>
                            <th className="col-status" onClick={() => handleSort('is_active')}>
                                <div className="sort-wrapper center">
                                    <span>STATUS</span>
                                    <SortArrows colKey="is_active" />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map(res => (
                            <ResourceRow 
                                key={res.id} 
                                resource={res} 
                                isEditor={isEditor}
								taxonomy={cache?.taxonomy || {}}
                                onToggleStatus={actions.toggleStatus}
                                onTogglePlanet={actions.togglePlanet}
                                onClick={handleRowClick}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
			<ResourceModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                resource={selectedResource}
                onSave={handleModalSave}
            />
        </section>
    );
};

export default ResourceList;