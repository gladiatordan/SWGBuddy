import React, { useState, useMemo } from 'react';
import { useResources } from '../../hooks/useResources';
import { useAuth } from '../../contexts/AuthContext';
import { filterResources, sortResources } from '../../utils/resourceUtils';
import ResourceRow from './ResourceRow';
import TaxonomySearch from '../Common/TaxonomySearch';
import ResourceModal from '../Modals/ResourceModal';
import Loader from '../Common/Loader';

const ResourceList = ({ serverId }) => {
    const { resources, taxonomy, loading, actions } = useResources(serverId);
    const { hasPermission } = useAuth();
    const isEditor = hasPermission('EDITOR');

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

    const handleModalSave = () => {
        actions.refresh(); // Refresh the table after save
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
        setFilters(prev => ({
            ...prev,
            stats: { ...prev.stats, [key]: value ? parseInt(value) : null }
        }));
    };

    const handlePlanetToggle = (planet) => {
        setFilters(prev => {
            const current = prev.planets;
            if (current.includes(planet)) return { ...prev, planets: current.filter(p => p !== planet) };
            return { ...prev, planets: [...current, planet] };
        });
    };

    // --- Data Pipeline ---
    const processedData = useMemo(() => {
        let data = filterResources(resources, filters, taxonomy); 
        data = sortResources(data, sortStack);
        return data;
    }, [resources, filters, sortStack, taxonomy]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / resultsPerPage) || 1;
    const paginatedData = processedData.slice((page - 1) * resultsPerPage, page * resultsPerPage);

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

                {/* 2. Search Row */}
                <div className="filter-col-search">
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
										style={{ display: 'block' }}
									>
										<i className="fa-solid fa-times"></i>
									</button>
								)}
							</div>

							<TaxonomySearch 
								taxonomy={taxonomy} 
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
                        {['oq','cr','cd','dr','fl','hr','ma','pe','sr','ut'].map(stat => (
                            <div className="stat-input-wrapper" key={stat}>
                                <input 
                                    type="number" 
                                    placeholder={stat.toUpperCase()} 
                                    className="stat-filter-input"
                                    onChange={(e) => handleStatChange(`res_${stat}`, e.target.value)}
                                />
                            </div>
                        ))}
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
                            {['OQ','CR','CD','DR','FL','HR','MA','PE','SR','UT'].map(s => {
                                const key = `res_${s.toLowerCase()}`;
                                return (
                                    <th key={s} className="col-stat" onClick={() => handleSort(key)}>
                                        <div className="sort-wrapper center">
                                            <span>{s}</span>
                                            <SortArrows colKey={key} />
                                        </div>
                                    </th>
                                );
                            })}
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
								taxonomy={taxonomy}
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