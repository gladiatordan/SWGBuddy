import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import SchematicSidebar from './SchematicSidebar';
import { STAT_MAPPING } from '../../utils/resourceUtils'; // Import Stat Mapping

const SchematicContainer = () => {
    const { selectedServer } = useServer();
    
    // Index Data
    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true);

    // --- TAB STATE ---
    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false, activeSubTab: 'best' }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

	const getComplexityRequirements = (val) => {
        if (val <= 15) return "Requires: General Crafting Tool";
        if (val <= 20) return "Requires: Specialized Crafting Tool";
        if (val <= 25) return "Requires: Specialized Crafting Tool + Public Crafting Station";
        return "Requires: Specialized Crafting Tool + Private Crafting Station";
    };

	const getQualityTooltip = (isHigh) => {
        return isHigh 
            ? "This schematic requires high quality resources for experimentation" 
            : "Resource Quality does not matter for this schematic";
    };

    // 1. Initial Load: Fetch the Index
    useEffect(() => {
        const loadIndex = async () => {
            setIsIndexLoading(true);
            try {
                // Mock Data
                const mockData = [
                    { id: 'armor_ubese_shirt', name: 'Ubese Armor Shirt', profession: 'Armorsmith', category: 'Armor' },
                    { id: 'weapon_dh17', name: 'DH17 Carbine', profession: 'Weaponsmith', category: 'Rifle' },
                    { id: 'food_brandy', name: 'Vasarian Brandy', profession: 'Chef', category: 'Drink' },
                    { id: 'struc_wall_module', name: 'Wall Module', profession: 'Architect', category: 'Structure' },
                ];
                setTimeout(() => setIndexData(mockData), 500); 
            } catch (err) {
                console.error("Failed to load schematic index", err);
            } finally {
                setIsIndexLoading(false);
            }
        };
        loadIndex();
    }, [selectedServer]);

    // --- TAB MANAGEMENT ---
    const handleAddTab = () => {
        if (tabs.length >= 10) return;
        const newId = Date.now();
        setTabs(prev => [...prev, { id: newId, schematic: null, details: null, loading: false, activeSubTab: 'best' }]);
        setActiveTabId(newId);
    };

    const handleCloseTab = (e, tabId) => {
        e.stopPropagation();
        const newTabs = tabs.filter(t => t.id !== tabId);
        
        if (newTabs.length === 0) {
            const resetId = Date.now();
            setTabs([{ id: resetId, schematic: null, details: null, loading: false }]);
            setActiveTabId(resetId);
        } else {
            setTabs(newTabs);
            if (activeTabId === tabId) {
                const index = tabs.findIndex(t => t.id === tabId);
                const nextTab = newTabs[index - 1] || newTabs[index] || newTabs[0];
                setActiveTabId(nextTab.id);
            }
        }
    };

    // --- DATA LOGIC ---
    
    const fetchDetailsForTab = async (schematic, tabId) => {
        setTabs(prev => prev.map(t => 
            t.id === tabId ? { ...t, schematic, loading: true } : t
        ));

        try {
            setTimeout(() => {
                setTabs(prev => prev.map(t => 
                    t.id === tabId ? { 
                        ...t, 
                        loading: false,
                        details: { 
                            certification: "Novice Armorsmith",
                            experience: 250,
                            complexity: 50,
                            slots: { "core": "Iron", "segment": "Steel" },
                            
                            // Mock Experimental Categories
                            experimental_categories: [
                                { 
                                    id: "exp_eff", 
                                    label: "Experimental Efficiency", 
                                    weights: { "res_quality": 33, "res_conductivity": 66 }, 
                                    selected: true 
                                },
                                { 
                                    id: "exp_dur", 
                                    label: "Experimental Durability", 
                                    weights: { "res_quality": 50, "res_toughness": 50 }, 
                                    selected: true 
                                },
                                { 
                                    id: "exp_res", 
                                    label: "Experimental Resistance", 
                                    weights: { "res_quality": 50, "res_heat_resist": 50 }, 
                                    selected: true 
                                }
                            ],

							// Mock Resource Data
                            best_resources: [
                                { id: 101, name: "Culun (Iron)", slot: "core", stats: "996 OQ, 980 UT", rating: "98.5%", date: "2024-01-10" },
                                { id: 102, name: "Hifil (Steel)", slot: "segment", stats: "990 OQ, 960 CD", rating: "97.2%", date: "2023-11-05" }
                            ],
                            current_resources: [
                                { id: 201, name: "Zicx (Iron)", slot: "core", stats: "940 OQ, 900 UT", rating: "92.0%", date: "2 Days Ago" }
                            ]
                        } 
                    } : t
                ));
            }, 600);
        } catch (err) {
            console.error("Detail load failed", err);
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t));
        }
    };

    const handleSelect = (schematic) => {
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        if (existingTab) {
            setActiveTabId(existingTab.id);
        } else {
            fetchDetailsForTab(schematic, activeTabId);
        }
    };

    // Toggle Handler
    const handleToggleCategory = (tabId, catId) => {
        setTabs(prev => prev.map(tab => {
            if (tab.id !== tabId) return tab;
            if (!tab.details || !tab.details.experimental_categories) return tab;

            const updatedCats = tab.details.experimental_categories.map(cat => 
                cat.id === catId ? { ...cat, selected: !cat.selected } : cat
            );

            return { 
                ...tab, 
                details: { ...tab.details, experimental_categories: updatedCats } 
            };
        }));
    };

    // Helper for formatting weights (e.g. "33% OQ, 66% CD")
    const formatWeights = (weights) => {
        return Object.entries(weights)
            .map(([stat, val]) => `${STAT_MAPPING[stat] || stat} ${val}%`)
            .join('   '); // Added extra spacing for readability
    };

	const handleSubTabChange = (tabId, subTab) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, activeSubTab: subTab } : t));
    };

	const renderResourceRows = (resources) => {
        if (!resources || resources.length === 0) {
            return <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px', color: 'var(--text-dim)'}}>No resources found</td></tr>;
        }
        return resources.map(res => (
            <tr key={res.id}>
                <td className="info-value" style={{textAlign: 'left'}}>{res.name}</td>
                <td className="info-value" style={{textAlign: 'left'}}>{res.slot}</td>
                <td className="info-value">{res.stats}</td>
                <td className="info-value quality-high">{res.rating}</td>
                <td className="info-value" style={{color: 'var(--text-dim)'}}>{res.date}</td>
            </tr>
        ));
    };

    return (
        <section id="schematics-container" className="schematics-layout page-container active">
            
            <SchematicSidebar 
                indexData={indexData} 
                selectedId={activeTab?.schematic?.id}
                onSelect={handleSelect}
            />

            <div className="schematics-main-area">
                
                <div className="schematics-tabs-bar custom-scrollbar-x">
                    {tabs.map(tab => (
                        <div 
                            key={tab.id}
                            className={`schematic-tab ${activeTabId === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTabId(tab.id)}
                            title={tab.schematic?.name || "New Tab"}
                        >
                            <span className="tab-title">{tab.schematic ? tab.schematic.name : "New Tab"}</span>
                            <button 
                                className="close-tab-btn"
                                onClick={(e) => handleCloseTab(e, tab.id)}
                            >
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>
                    ))}
                    {tabs.length < 10 && (
                        <button className="add-tab-btn" onClick={handleAddTab} title="New Tab">
                            <i className="fa-solid fa-plus"></i>
                        </button>
                    )}
                </div>

                <div className="schematics-content-area">
                    {activeTab.loading && (
                        <div className="modal-loader" style={{position: 'absolute', inset: 0, borderRadius: '4px', zIndex: 20}}>
                            <div className="spinner"></div>
                            <div className="loader-text">READING BLUEPRINT...</div>
                        </div>
                    )}

                    {!activeTab.schematic && !activeTab.loading && (
                        <div className="empty-state">
                            <i className="fa-solid fa-microchip"></i>
                            <h2>No Schematic Selected</h2>
                            <p>Select a blueprint from the index to begin analysis.</p>
                        </div>
                    )}

                    {!activeTab.loading && activeTab.schematic && activeTab.details && (
                        <div className="schematic-content">
                            
                            <div className="schematic-header">
                                <h2 className="schematic-title">{activeTab.schematic.name}</h2>
                            </div>

                            <div className="specs-container">
                                
                                {/* LAYOUT CHANGE: 
                                    Using CSS Grid instead of Flex Column.
                                    - gridTemplateColumns: '1fr 1fr' -> Two equal columns (25% screen width each)
                                    - Order: Spec (Top-Left), Ingredients (Top-Right), Experimental (Bottom-Left)
                                */}
                                <div className="specs-left-column" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    
                                    {/* 1. Specifications Table (Top Left) */}
                                    <div className="info-table-wrapper">
                                        <div className="table-header">Specifications</div>
                                        <table className="schematic-info-table">
											<tbody>
												<tr>
													<td className="info-label">Profession</td>
													<td className="info-value">{activeTab.schematic.profession}</td>
												</tr>
												<tr>
													<td className="info-label">Certification Required</td>
													<td className="info-value" title={activeTab.details.certification}>
														{activeTab.details.certification}
													</td>
												</tr>
												<tr>
													<td className="info-label">Category</td>
													<td className="info-value">{activeTab.schematic.category}</td>
												</tr>
												<tr>
													<td className="info-label">Base Experience</td>
													<td className="info-value">{activeTab.details.experience}</td>
												</tr>
												<tr>
                                                    <td className="info-label">Complexity</td>
                                                    <td className="info-value">
                                                        {activeTab.details.complexity}
                                                        <i 
                                                            className="fa-solid fa-circle-question info-tooltip-icon" 
                                                            title={getComplexityRequirements(activeTab.details.complexity)}
                                                        ></i>
                                                    </td>
                                                </tr>
                                                {(() => {
                                                    const isHigh = activeTab.details.experimental_categories && activeTab.details.experimental_categories.length > 0;
                                                    return (
                                                        <tr>
                                                            <td className="info-label">Quality</td>
                                                            <td className={`info-value ${isHigh ? 'quality-high' : 'quality-low'}`}>
                                                                {isHigh ? "High" : "Low"}
                                                                <i 
                                                                    className="fa-solid fa-circle-question info-tooltip-icon" 
                                                                    title={getQualityTooltip(isHigh)}
                                                                ></i>
                                                            </td>
                                                        </tr>
                                                    );
                                                })()}
											</tbody>
										</table>
                                    </div>

                                    {/* 2. Ingredients Table (Top Right) */}
                                    {/* Moved here to occupy the 2nd column in the top row */}
                                    <div className="info-table-wrapper">
                                        <div className="table-header">Ingredients</div>
                                        <table className="schematic-info-table">
                                            <tbody>
                                                {activeTab.details.slots && Object.entries(activeTab.details.slots).length > 0 ? (
                                                    Object.entries(activeTab.details.slots).map(([key, type]) => (
                                                        <tr key={key}>
                                                            <td className="ingredient-slot" style={{textTransform: 'capitalize'}}>
                                                                {key.replace(/_/g, ' ')}
                                                            </td>
                                                            <td className="ingredient-type">{type}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="2" style={{textAlign: 'center', color: 'var(--text-dim)'}}>
                                                            No ingredients listed
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* 3. Experimental Categories Table (Bottom Left - New Row) */}
                                    <div className="info-table-wrapper" style={{gridColumn: '1 / -1', width: '46.5%'}}>
                                        <div className="table-header">Experimental Categories</div>
                                        <div className="exp-cat-list">
                                            {activeTab.details.experimental_categories && activeTab.details.experimental_categories.length > 0 ? (
                                                activeTab.details.experimental_categories.map((cat) => (
                                                    <div key={cat.id} className={`exp-cat-item ${cat.selected ? 'selected' : 'dimmed'}`}>
                                                        <div className="exp-cat-header">
                                                            <span className="exp-cat-label">{cat.label}</span>
                                                            <label className="toggle-switch">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={cat.selected} 
                                                                    onChange={() => handleToggleCategory(activeTab.id, cat.id)}
                                                                />
                                                                <span className="slider round"></span>
                                                            </label>
                                                        </div>
                                                        <div className="exp-cat-weights">
                                                            {formatWeights(cat.weights)}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="empty-exp">No experiments available</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN (Empty for now - 50% width) */}
                                <div style={{flex: '0 0 50%'}}>
                                </div>

                            </div>
                        {/* --- NEW SECTION: Resource Tabs (Full Width) --- */}
                            <div className="resource-tabs-section" style={{width: '100%', marginTop: '20px'}}>
                                
                                {/* Sub-Tab Navigation (Styled like Main Tabs) */}
                                <div className="resource-tabs-bar">
                                    <button 
                                        className={`resource-tab ${activeTab.activeSubTab === 'best' ? 'active' : ''}`}
                                        onClick={() => handleSubTabChange(activeTab.id, 'best')}
                                    >
                                        Best Resources
                                    </button>
                                    <button 
                                        className={`resource-tab ${activeTab.activeSubTab === 'current' ? 'active' : ''}`}
                                        onClick={() => handleSubTabChange(activeTab.id, 'current')}
                                    >
                                        Current Resources
                                    </button>
                                </div>

                                {/* Tab Content */}
                                <div className="info-table-wrapper resource-tab-content" style={{minHeight: '150px'}}>
                                    <table className="schematic-info-table">
                                        <thead>
                                            <tr>
                                                <th style={{textAlign: 'left', padding: '8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)'}}>Name</th>
                                                <th style={{textAlign: 'left', padding: '8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)'}}>Slot</th>
                                                <th style={{textAlign: 'right', padding: '8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)'}}>Stats</th>
                                                <th style={{textAlign: 'right', padding: '8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)'}}>Rating</th>
                                                <th style={{textAlign: 'right', padding: '8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)'}}>Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeTab.activeSubTab === 'best' 
                                                ? renderResourceRows(activeTab.details.best_resources)
                                                : renderResourceRows(activeTab.details.current_resources)
                                            }
                                        </tbody>
                                    </table>
                                </div>

                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default SchematicContainer;