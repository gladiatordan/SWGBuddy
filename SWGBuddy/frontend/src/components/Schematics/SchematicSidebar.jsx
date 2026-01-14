import React, { useState, useMemo } from 'react';

const SchematicSidebar = ({ indexData, selectedId, onSelect }) => {
    const [search, setSearch] = useState('');
    
    // Filter States
    const [filterType, setFilterType] = useState('profession'); // 'profession' or 'category' (Type)
    const [selectedCategory, setSelectedCategory] = useState(''); // The specific value selected

    // 1. Generate Dynamic Options based on Index Data
    // This creates a unique list of Professions or Categories from the loaded data
    const filterOptions = useMemo(() => {
        if (!indexData) return [];
        const key = filterType; // 'profession' or 'category'
        
        // Extract unique values, filter out nulls, and sort alphabetically
        const uniqueValues = [...new Set(indexData.map(item => item[key]))]
            .filter(val => val) 
            .sort();
            
        return uniqueValues;
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
                // Check if the item's field (e.g. profession) matches the selected value
                matchesCategory = item[filterType] === selectedCategory;
            }

            return matchesSearch && matchesCategory;
        });
    }, [indexData, search, filterType, selectedCategory]);

    // Handle changing the "Filter By" dropdown
    const handleTypeChange = (newType) => {
        setFilterType(newType);
        setSelectedCategory(''); // Reset specific selection when switching types
    };

    return (
        <aside className="schematics-sidebar">
            <div className="sidebar-header">
                {/* 1. Filter Dropdowns Row */}
                <div className="filter-row">
                    <select 
                        className="sidebar-select"
                        value={filterType}
                        onChange={(e) => handleTypeChange(e.target.value)}
                        title="Filter Mode"
                    >
                        <option value="profession">Profession</option>
                        <option value="category">Type</option>
                    </select>

                    <select 
                        className="sidebar-select"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        disabled={filterOptions.length === 0}
                        title={`Select ${filterType === 'profession' ? 'Profession' : 'Type'}`}
                    >
                        <option value="">All</option>
                        {filterOptions.length > 0 ? (
                            filterOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))
                        ) : (
                            // Fallback/Placeholders until DB is ready
                            <>
                                <option value="placeholder" disabled>Loading...</option>
                            </>
                        )}
                    </select>
                </div>

                {/* 2. Search Input */}
                <input 
                    type="text" 
                    className="sidebar-search" 
                    placeholder="Search Schematics..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
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