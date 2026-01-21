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
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef(null);
    const listRef = useRef(null);

    // Convert the dictionary prop into a sortable array
    const flatList = useMemo(() => {
        if (!options) return [];
        return Object.entries(options).map(([key, val]) => {
            // Handle both simple label map and detailed object map
            const label = typeof val === 'object' ? val.label : val;
            return { value: key, label: label };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }, [options]);

	// Derived label for the input field
    const selectedLabel = useMemo(() => {
        if (!value || !options) return '';
        const entry = options[value];
        return typeof entry === 'object' ? entry.label : entry;
    }, [value, options]);

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

    const handleSelect = (item) => {
        onChange(item ? item.value : null); // Return the Key (class_tree)
        setIsOpen(false);
        setSearch('');
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
            <input 
                type="text" 
                className="dropdown-search-input" 
                placeholder={placeholder}
                value={isOpen ? search : (selectedLabel || '')}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setIsOpen(true);
                    setActiveIndex(0);
                }}
                onFocus={() => {
                    setSearch(''); 
                    setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
            />
            
            {isOpen && (
                <div className="dropdown-list" ref={listRef}>
                    {filtered.map((item, idx) => (
                        <div 
                            key={item.value} 
                            className={`dropdown-item ${idx === activeIndex ? 'active' : ''}`}
                            onClick={() => handleSelect(item)}
                        >
                            {item.label}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="dropdown-item">No matches</div>}
                </div>
            )}

            {/* Clear Button: Render whenever there is a value, regardless of usage context */}
            {value && (
                <button 
                    className="reset-filter-btn" 
                    onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
                    type="button"
                >
                    &times;
                </button>
            )}
        </div>
    );
};

export default TaxonomySearch;