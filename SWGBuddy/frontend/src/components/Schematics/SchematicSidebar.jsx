import React, { useState, useMemo } from 'react';
import TaxonomySearch from '../Common/TaxonomySearch'; // Import the shared component

const SchematicSidebar = ({ indexData, selectedId, onSelect }) => {
    const [search, setSearch] = useState('');
    
    // Filter States
    const [filterType, setFilterType] = useState('profession'); 
    const [selectedCategory, setSelectedCategory] = useState(''); 

    // Define Mode Options for TaxonomySearch
    const MODE_OPTIONS = useMemo(() => ({
        'profession': 'Profession',
        'category': 'Type'
    }), []);

    // 1. Generate Dynamic Options
    // Transform array ['Armorsmith', 'Chef'] -> Object {'Armorsmith': 'Armorsmith', 'Chef': 'Chef'}
    const categoryOptions = useMemo(() => {
        if (!indexData) return {};
        
        const key = filterType; // 'profession' or 'category'
        const uniqueValues = [...new Set(indexData.map(item => item[key]))]
            .filter(val => val)
            .sort();

        // Reduce to dictionary format required by TaxonomySearch
        return uniqueValues.reduce((acc, val) => {
            acc[val] = val;
            return acc;
        }, {});
    }, [indexData, filterType]);

    // 2. Main Filter Logic
    const filteredList = useMemo(() => {
        if (!indexData) return [];
        
        return indexData.filter(item => {
            // A. Search Term Check
            const term = search.toLowerCase();
            const matchesSearch = !term || 
                item.name.toLowerCase().includes(term) || 
                (item.profession && item.profession.toLowerCase().includes(term));

            // B. Dropdown Filter Check
            let matchesCategory = true;
            if (selectedCategory) {
                matchesCategory = item[filterType] === selectedCategory;
            }

            return matchesSearch && matchesCategory;
        });
    }, [indexData, search, filterType, selectedCategory]);

    // Handlers
    const handleTypeChange = (val) => {
        // Prevent clearing the mode (default to profession if null)
        setFilterType(val || 'profession');
        setSelectedCategory(''); 
    };

    return (
        <aside className="schematics-sidebar">
            <div className="sidebar-header">
                {/* 1. Filter Dropdowns Row */}
                <div className="filter-row" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    
                    {/* Mode Selector (Reusing TaxonomySearch) */}
                    <div style={{ flex: 1 }}>
                        <TaxonomySearch 
                            options={MODE_OPTIONS}
                            value={filterType}
                            onChange={handleTypeChange}
                            placeholder="Filter Mode"
                        />
                    </div>

                    {/* Dynamic Category Selector (Reusing TaxonomySearch) */}
                    <div style={{ flex: 1 }}>
                        <TaxonomySearch 
                            options={categoryOptions}
                            value={selectedCategory}
                            onChange={setSelectedCategory} // Handles null automatically
                            disabled={Object.keys(categoryOptions).length === 0}
                            placeholder={Object.keys(categoryOptions).length === 0 ? "Loading..." : "Select Category"}
                        />
                    </div>
                </div>

                {/* 2. Search Input */}
                <input 
                    type="text" 
                    className="sidebar-search" 
                    placeholder="Search Schematics..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                />
            </div>
            
            {/* 3. Filtered List */}
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