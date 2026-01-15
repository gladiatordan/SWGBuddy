import React, { useState, useMemo, useEffect, useRef } from 'react';

const TaxonomySearch = ({ 
    taxonomy, 
    value, 
    onChange, 
    placeholder = "Search Type...", 
    onlyValid = false, // Set to true for ResourceModal, false for Filters
    disabled = false 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    // Flatten taxonomy once based on the onlyValid requirement
    const flatList = useMemo(() => {
        const list = [];
        const traverse = (nodes) => {
            if (!nodes) return;
            nodes.forEach(node => {
                // If onlyValid is true, only add leaf nodes (is_valid: true)
                // If onlyValid is false, add everything (for filtering)
                if (!onlyValid || node.is_valid) {
                    list.push({ label: node.label, is_valid: node.is_valid });
                }
                if (node.children) traverse(node.children);
            });
        };
        traverse(taxonomy);
        // Sort alphabetically for easier browsing
        return list.sort((a, b) => a.label.localeCompare(b.label));
    }, [taxonomy, onlyValid]);

    const filtered = useMemo(() => {
        if (onlyValid && !isOpen && !search) return []; // Don't filter if closed in selector mode
        return flatList.filter(item => 
            item.label.toLowerCase().includes(search.toLowerCase())
        );
    }, [flatList, search, onlyValid, isOpen]);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (label) => {
        onChange(label);
        setIsOpen(false);
        setSearch(''); // Clear search on selection
    };

    if (disabled) {
        return <div className="static-value">{value || "Unknown Type"}</div>;
    }

    return (
        <div className="custom-dropdown" ref={wrapperRef}>
            {/* Input field acts as both display and search */}
            <input 
                type="text" 
                className="dropdown-search-input" 
                placeholder={value || placeholder}
                value={isOpen ? search : (value || '')}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => {
                    setSearch(''); // Clear search text to show all options on focus
                    setIsOpen(true);
                }}
            />
            
            {isOpen && (
                <div className="dropdown-list" style={{ display: 'block' }}>
                    {filtered.map((item, idx) => (
                        <div 
                            key={`${item.label}-${idx}`} 
                            className="dropdown-item"
                            onClick={() => handleSelect(item.label)}
                        >
                            {item.label}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="dropdown-item" style={{color: '#666'}}>No matches</div>
                    )}
                </div>
            )}

            {/* Clear Button (Optional: for filter mode) */}
            {!onlyValid && value && (
                <button 
                    className="reset-filter-btn" 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(null);
                    }}
                >
                    &times;
                </button>
            )}
        </div>
    );
};

export default TaxonomySearch;