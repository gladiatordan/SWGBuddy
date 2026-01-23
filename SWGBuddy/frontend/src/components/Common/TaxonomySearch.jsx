import React, { useState, useMemo, useEffect, useRef } from 'react';

const TaxonomySearch = ({ 
    options, 
    value, 
    onChange, 
    placeholder = "Search Type...",
    disabled = false 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef(null);
    const listRef = useRef(null);

    // 1. Handle both Dictionary (old) and Array (new) options
    const flatList = useMemo(() => {
        if (!options) return [];
        
        // If it's already an array, assume it's pre-sorted/grouped
        if (Array.isArray(options)) {
            return options;
        }

        // Legacy Dictionary support
        return Object.entries(options).map(([key, val]) => {
            const label = typeof val === 'object' ? val.label : val;
            return { value: key, label: label };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }, [options]);

    // 2. Resolve Label for Input Display
    const selectedLabel = useMemo(() => {
        if (!value) return '';
        // Find match in flatList
        const found = flatList.find(item => item.value === value);
        return found ? found.label : value;
    }, [value, flatList]);

    const filtered = useMemo(() => {
        if (!search && !isOpen) return []; 
        if (!search) return flatList;
        
        return flatList.filter(item => {
            // Always keep headers visible if their children match? 
            // For simplicity, just filter by label, headers usually don't match search terms.
            // Better UX: Filter normally, but maybe hiding headers is fine during search.
            if (item.isHeader) return true; // Optional: Keep headers or filter them out.
            return item.label.toLowerCase().includes(search.toLowerCase());
        });
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
        if (item.isHeader) return; // Prevent selecting headers
        onChange(item.value); 
        setIsOpen(false);
        setSearch('');
        setActiveIndex(-1);
    };

    // Keyboard Navigation
    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                setSearch(''); 
            }
            return;
        }

        const moveIndex = (direction) => {
            let nextIndex = activeIndex + direction;
            
            // Loop until we find a non-header item or hit bounds
            while (nextIndex >= 0 && nextIndex < filtered.length) {
                if (!filtered[nextIndex].isHeader) return nextIndex;
                nextIndex += direction;
            }
            return activeIndex; // No valid move
        };

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => {
                    // Simple bounds check first
                    if (prev >= filtered.length - 1) return 0;
                    // Find next non-header
                    let next = prev + 1;
                    while (next < filtered.length && filtered[next].isHeader) next++;
                    return next < filtered.length ? next : prev;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => {
                    if (prev <= 0) return filtered.length - 1;
                    let next = prev - 1;
                    while (next >= 0 && filtered[next].isHeader) next--;
                    return next >= 0 ? next : prev;
                });
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < filtered.length) {
                    handleSelect(filtered[activeIndex]); 
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setActiveIndex(-1);
                break;
            default: break;
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

    if (disabled) return <div className="static-value">{selectedLabel || "Loading..."}</div>;

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
                onFocus={() => { setSearch(''); setIsOpen(true); }}
                onKeyDown={handleKeyDown}
                readOnly={!!value && !isOpen} // Optional: makes it feel more like a select when value exists
            />
            
            {isOpen && (
                <div className="dropdown-list" style={{ display: 'block' }} ref={listRef}>
                    {filtered.map((item, idx) => (
                        <div 
                            key={`${item.value}-${idx}`} 
                            className={`dropdown-item ${item.isHeader ? 'dropdown-header' : ''} ${idx === activeIndex ? 'active' : ''}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => !item.isHeader && setActiveIndex(idx)}
                        >
                            {item.label}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="dropdown-item" style={{color: '#666'}}>No matches</div>
                    )}
                </div>
            )}

            {value && (
                <button 
                    className="reset-filter-btn" 
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange(null); // Clear value
                    }}
                    type="button"
                >
                    &times;
                </button>
            )}
        </div>
    );
};

export default TaxonomySearch;