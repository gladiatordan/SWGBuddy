import React, { useState, useMemo, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import { useAuth } from '../../contexts/AuthContext'; // Import Auth
import TaxonomySearch from '../Common/TaxonomySearch';
import AddSchematicModal from '../Modals/AddSchematicModal';

const SchematicSidebar = ({ selectedId, onSelect, onAddClick }) => {
    const { selectedServer } = useServer();
    const { hasPermission } = useAuth(); // Get Permission Helper
    const [indexData, setIndexData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState(null); 
    
    // State for Recalculate Button
    const [isRecalculating, setIsRecalculating] = useState(false);

    // Fetch Index
    const loadIndex = async () => {
        if (!selectedServer) return;
        setIsLoading(true);
        try {
            const data = await API.fetchSchematicIndex(selectedServer);
            setIndexData(data || []);
        } catch (err) {
            console.error("Failed to load schematic index", err);
            setIndexData([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadIndex();
    }, [selectedServer]);

    // 1. Generate Unified Options List
    const filterOptions = useMemo(() => {
        if (!indexData.length) return [];

        const professions = [...new Set(indexData.map(item => item.profession).filter(Boolean))].sort();
        const categories = [...new Set(indexData.map(item => item.category).filter(Boolean))].sort();

        return [
            { label: 'Professions', value: 'header_prof', isHeader: true },
            ...professions.map(p => ({ label: p, value: `profession:${p}` })),
            
            { label: 'Categories', value: 'header_cat', isHeader: true },
            ...categories.map(c => ({ label: c, value: `category:${c}` }))
        ];
    }, [indexData]);

    // 2. Main Filter Logic
    const filteredList = useMemo(() => {
        if (!indexData.length) return [];
        
        return indexData.filter(item => {
            const term = search.toLowerCase();
            const matchesSearch = !term || 
                item.name.toLowerCase().includes(term) || 
                (item.profession && item.profession.toLowerCase().includes(term));

            let matchesFilter = true;
            if (activeFilter) {
                const [type, val] = activeFilter.split(':');
                if (type === 'profession') matchesFilter = item.profession === val;
                else if (type === 'category') matchesFilter = item.category === val;
            }

            return matchesSearch && matchesFilter;
        });
    }, [indexData, search, activeFilter]);

    // --- HANDLERS ---
    
    const handleRecalculate = async () => {
        if (!window.confirm("This will trigger a full recalculation of all schematic rankings for this server. This process is resource-intensive. Continue?")) {
            return;
        }

        setIsRecalculating(true);
        try {
            await API.recalculateRankings(selectedServer);
            alert("Rankings recalculation started. Updates will appear as they process.");
        } catch (err) {
            alert("Failed to trigger recalculation: " + (err.response?.data?.error || err.message));
        } finally {
            setIsRecalculating(false);
        }
    };

    return (
        <aside className="schematics-sidebar">
            <div className="sidebar-header">
                <div className="filter-row" style={{ marginBottom: '10px' }}>
                    <TaxonomySearch 
                        options={filterOptions}
                        value={activeFilter}
                        onChange={setActiveFilter}
                        placeholder="Filter by..."
                        disabled={filterOptions.length === 0}
                    />
                </div>

                <input 
                    type="text" 
                    className="sidebar-search" 
                    placeholder="Search Schematics..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                />
            </div>
            
            <div className="sidebar-list custom-scrollbar">
                {isLoading ? (
                    <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-dim)'}}>
                        Loading Index...
                    </div>
                ) : filteredList.length > 0 ? (
                    filteredList.map(item => (
                        <div 
                            key={item.id} 
                            className={`schematic-item ${selectedId === item.id ? 'active' : ''}`}
                            onClick={() => onSelect(item)}
                        >
                            <span className="schematic-name">{item.name}</span>
                            <div className="schematic-meta">
                                <span>{item.profession}</span>
                                <span>{item.category}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem'}}>
                        No matches found.
                    </div>
                )}
            </div>

            {/* --- ADMIN FOOTER --- */}
            <div className="sidebar-footer" style={{
                padding: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                {/* Superadmin Only: Recalculate */}
                {hasPermission('SUPERADMIN') && (
                    <button 
                        className="btn-secondary" 
                        onClick={handleRecalculate}
                        disabled={isRecalculating}
                        style={{ width: '100%', fontSize: '0.85rem', padding: '8px' }}
                        title="Force update of all schematic rankings"
                    >
                        {isRecalculating ? (
                            <><i className="fa-solid fa-spinner fa-spin"></i> Processing...</>
                        ) : (
                            <><i className="fa-solid fa-calculator"></i> Recalc Rankings</>
                        )}
                    </button>
                )}

                {/* Admin Only: Add Schematic */}
                {hasPermission('ADMIN') && (
                    <button 
                        className="btn-primary" 
                        onClick={onAddClick} 
                        style={{ width: '100%', fontSize: '0.85rem', padding: '8px' }}
                    >
                        <i className="fa-solid fa-plus"></i> Add Schematic
                    </button>
                )}
            </div>
        </aside>
    );
};

export default SchematicSidebar;