import React, { useState, useMemo } from 'react';
import TaxonomySearch from '../Common/TaxonomySearch';

const SchematicSidebar = ({ indexData, selectedId, onSelect }) => {
    const [search, setSearch] = useState('');
    
    // Unified Filter State
    // Format: "type:value" (e.g. "profession:Armorsmith" or "category:Weapon")
    const [activeFilter, setActiveFilter] = useState(null); 

    // 1. Generate Unified Options List
    const filterOptions = useMemo(() => {
        if (!indexData) return [];

        const professions = [...new Set(indexData.map(item => item.profession).filter(Boolean))].sort();
        const categories = [...new Set(indexData.map(item => item.category).filter(Boolean))].sort();

        return [
            // Section 1: Professions
            { label: 'Professions', value: 'header_prof', isHeader: true },
            ...professions.map(p => ({ label: p, value: `profession:${p}` })),
            
            // Section 2: Categories
            { label: 'Categories', value: 'header_cat', isHeader: true },
            ...categories.map(c => ({ label: c, value: `category:${c}` }))
        ];
    }, [indexData]);

    // 2. Main Filter Logic
    const filteredList = useMemo(() => {
        if (!indexData) return [];
        
        return indexData.filter(item => {
            // A. Search Term
            const term = search.toLowerCase();
            const matchesSearch = !term || 
                item.name.toLowerCase().includes(term) || 
                (item.profession && item.profession.toLowerCase().includes(term));

            // B. Dropdown Filter
            let matchesFilter = true;
            if (activeFilter) {
                const [type, val] = activeFilter.split(':');
                if (type === 'profession') {
                    matchesFilter = item.profession === val;
                } else if (type === 'category') {
                    matchesFilter = item.category === val;
                }
            }

            return matchesSearch && matchesFilter;
        });
    }, [indexData, search, activeFilter]);

    return (
        <aside className="schematics-sidebar">
            <div className="sidebar-header">
                {/* Unified Filter */}
                <div className="filter-row" style={{ marginBottom: '10px' }}>
                    <TaxonomySearch 
                        options={filterOptions}
                        value={activeFilter}
                        onChange={setActiveFilter}
                        placeholder="Filter by..."
                        disabled={filterOptions.length === 0}
                    />
                </div>

                {/* Search Input */}
                <input 
                    type="text" 
                    className="sidebar-search" 
                    placeholder="Search Schematics..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                />
            </div>
            
            {/* Filtered List */}
            <div className="sidebar-list custom-scrollbar">
                {filteredList.length > 0 ? (
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
                        {indexData.length === 0 ? "Loading Index..." : "No matches found."}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default SchematicSidebar;