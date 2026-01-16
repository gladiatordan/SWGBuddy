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
    const [activeIndex, setActiveIndex] = useState(-1); // Keyboard Nav State
    const wrapperRef = useRef(null);
    const listRef = useRef(null);

    // Flatten taxonomy once based on the onlyValid requirement
    const flatList = useMemo(() => {
        const list = [];
        const traverse = (nodes) => {
            if (!nodes) return;
            nodes.forEach(node => {
				// Omit anything space-related as these are just asteroids and always statically-assigned.
				if (node.label === "Space Resource") {
                    return; 
                }
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
        // If searching, filter. If just open, show all.
        if (!search && !isOpen) return []; 
        if (!search) return flatList;
        return flatList.filter(item => 
            item.label.toLowerCase().includes(search.toLowerCase())
        );
    }, [flatList, search, isOpen]);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (label) => {
        onChange(label);
        setIsOpen(false);
        setSearch(''); // Clear search on selection
        setActiveIndex(-1);
    };

    // Keyboard Navigation Handler
    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                setSearch(''); 
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < filtered.length) {
                    handleSelect(filtered[activeIndex].label);
                } else if (filtered.length > 0 && search) {
                    // If user typed something and hits enter, select first match if no active index
                    handleSelect(filtered[0].label);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setActiveIndex(-1);
                break;
            default:
                break;
        }
    };

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const activeItem = listRef.current.children[activeIndex];
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

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
                    setActiveIndex(0); // Reset to top on search
                }}
                onFocus={() => {
                    setSearch(value || ''); 
                    setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
            />
            
            {isOpen && (
                <div className="dropdown-list" style={{ display: 'block' }} ref={listRef}>
                    {filtered.map((item, idx) => (
                        <div 
                            key={`${item.label}-${idx}`} 
                            className={`dropdown-item ${idx === activeIndex ? 'active' : ''}`}
                            onClick={() => handleSelect(item.label)}
                            style={idx === activeIndex ? { background: '#1a1f26', color: 'var(--accent-blue)' } : {}}
                        >
                            {item.label}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="dropdown-item" style={{color: '#666'}}>No matches</div>
                    )}
                </div>
            )}

            {/* Clear Button: Render whenever there is a value, regardless of usage context */}
            {value && (
                <button 
                    className="reset-filter-btn" 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(null);
                    }}
                    tabIndex="-1"
                    type="button" // Prevent form submission in modals
                >
                    &times;
                </button>
            )}
        </div>
    );
};

export default TaxonomySearch;