import React, { useState, useMemo, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import TaxonomySearch from '../Common/TaxonomySearch';

const SchematicSidebar = ({ selectedId, onSelect }) => {
    const { selectedServer } = useServer();
    const [indexData, setIndexData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState(null); 

    // Fetch Index
    useEffect(() => {
        const loadIndex = async () => {
            if (!selectedServer) return;
            setIsLoading(true);
            try {
                // FIX: selectedServer is a string, pass it directly
                const data = await API.fetchSchematicIndex(selectedServer);
                setIndexData(data || []);
            } catch (err) {
                console.error("Failed to load schematic index", err);
                setIndexData([]);
            } finally {
                setIsLoading(false);
            }
        };
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
        </aside>
    );
};

export default SchematicSidebar;