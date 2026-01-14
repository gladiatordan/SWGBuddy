import React, { useState, useMemo, useEffect, useRef } from 'react';

const TaxonomySelector = ({ taxonomy, value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    // Flatten taxonomy for searching
    const flatList = useMemo(() => {
        const list = [];
        const traverse = (nodes) => {
            if (!nodes) return;
            nodes.forEach(node => {
                if (node.is_valid) { // Only allow selection of valid leaf types
                    list.push(node.label);
                }
                if (node.children) traverse(node.children);
            });
        };
        traverse(taxonomy);
        return list.sort();
    }, [taxonomy]);

    const filtered = flatList.filter(item => item.toLowerCase().includes(search.toLowerCase()));

    // Close on click outside
    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (disabled) {
        return <div className="static-value">{value || "Unknown Type"}</div>;
    }

    return (
        <div className="custom-dropdown" ref={wrapperRef}>
            <div 
                className="dropdown-selected" 
                onClick={() => setIsOpen(!isOpen)}
            >
                {value || "Select Resource Type..."}
            </div>
            
            {isOpen && (
                <div className="dropdown-list" style={{ display: 'block' }}>
                    <input 
                        type="text" 
                        className="dropdown-search-input" 
                        placeholder="Search types..." 
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    />
                    {filtered.map(type => (
                        <div 
                            key={type} 
                            className="dropdown-item"
                            onClick={() => {
                                onChange(type);
                                setIsOpen(false);
                                setSearch('');
                            }}
                        >
                            {type}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="dropdown-item" style={{color: '#666'}}>No matches</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TaxonomySelector;