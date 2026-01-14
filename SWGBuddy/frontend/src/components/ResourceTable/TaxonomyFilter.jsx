import React, { useState, useMemo, useRef, useEffect } from 'react';

const TaxonomyFilter = ({ taxonomyTree, selectedCategory, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    // Flatten the tree for the search list (Ported from taxonomy.js)
    const flatList = useMemo(() => {
        const list = [];
        const traverse = (nodes) => {
            if (!nodes) return;
            nodes.forEach(node => {
                // Add current node
                list.push({ label: node.label, is_valid: node.is_valid });
                // Traverse children
                if (node.children) traverse(node.children);
            });
        };
        traverse(taxonomyTree);
        return list;
    }, [taxonomyTree]);

    // Filter the list based on input
    const filteredList = useMemo(() => {
        if (!searchTerm) return [];
        const lowerTerm = searchTerm.toLowerCase();
        return flatList.filter(item => item.label.toLowerCase().includes(lowerTerm));
    }, [flatList, searchTerm]);

    // Handle clicking outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (label) => {
        setSearchTerm(label);
        onSelect(label);
        setIsOpen(false);
    };

    const handleClear = () => {
        setSearchTerm('');
        onSelect(null); // Reset to "All Resources"
    };

    return (
        <div className="filter-input-wrapper grow-input" ref={wrapperRef}>
            {/* The Dropdown / Input Area */}
            <div className="custom-dropdown" id="taxonomy-dropdown">
                <input 
                    type="text" 
                    className="dropdown-search-input" 
                    placeholder="Search Type..." 
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                
                {/* The Dropdown List */}
                {isOpen && (
                    <div className="dropdown-list" style={{ display: 'block' }}>
                        {filteredList.length > 0 ? (
                            filteredList.map((item, idx) => (
                                <div 
                                    key={`${item.label}-${idx}`} 
                                    className="dropdown-item"
                                    onClick={() => handleSelect(item.label)}
                                >
                                    {item.label}
                                </div>
                            ))
                        ) : (
                            <div className="dropdown-item" style={{ color: 'var(--text-dim)' }}>
                                {searchTerm ? "No matches found" : "Type to search..."}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Reset Button (Only shows if a category is selected) */}
            {selectedCategory && (
                <button 
                    className="reset-filter-btn" 
                    title="Reset" 
                    onClick={handleClear}
                    style={{ display: 'block' }}
                >
                    <i className="fa-solid fa-times"></i>
                </button>
            )}
        </div>
    );
};

export default TaxonomyFilter;