import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import SchematicSidebar from './SchematicSidebar';
import '../../assets/css/schematics.css'; 

const SchematicContainer = () => {
    const { selectedServer } = useServer();
    
    // Index Data
    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true);

    // --- TAB STATE ---
    // Start with one empty tab
    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    // Derived: The currently active tab object
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // 1. Initial Load: Fetch the Index
    useEffect(() => {
        const loadIndex = async () => {
            setIsIndexLoading(true);
            try {
                // Mock Data (Replace with API call later)
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
        if (tabs.length >= 10) return; // Limit to 10
        const newId = Date.now();
        setTabs(prev => [...prev, { id: newId, schematic: null, details: null, loading: false }]);
        setActiveTabId(newId); // Switch to new tab
    };

    const handleCloseTab = (e, tabId) => {
        e.stopPropagation(); // Prevent clicking the tab itself
        
        // Don't close the last tab (optional UX choice: reset it instead?)
        // Let's allow closing, but if 0 tabs, create a new empty one immediately.
        
        const newTabs = tabs.filter(t => t.id !== tabId);
        
        if (newTabs.length === 0) {
            // Reset to one empty tab
            const resetId = Date.now();
            setTabs([{ id: resetId, schematic: null, details: null, loading: false }]);
            setActiveTabId(resetId);
        } else {
            setTabs(newTabs);
            // If we closed the active tab, switch to the one to the left (or right if first)
            if (activeTabId === tabId) {
                const index = tabs.findIndex(t => t.id === tabId);
                // Try previous index, otherwise next (which shifts down to current index)
                const nextTab = newTabs[index - 1] || newTabs[index] || newTabs[0];
                setActiveTabId(nextTab.id);
            }
        }
    };

    // --- SELECTION LOGIC ---
    
    // Helper to fetch details for a specific tab
    const fetchDetailsForTab = async (schematic, tabId) => {
        setTabs(prev => prev.map(t => 
            t.id === tabId ? { ...t, schematic, loading: true } : t
        ));

        try {
            // Mock Fetch with expanded data fields
            setTimeout(() => {
                setTabs(prev => prev.map(t => 
                    t.id === tabId ? { 
                        ...t, 
                        loading: false,
                        details: { 
                            // New Mock Data Fields
                            certification: "Novice Armorsmith",
                            experience: 250,
                            complexity: 15,
                            // If empty {}, Quality is "Low". If populated, "High".
                            experiment_weights: { "res_oq": 0.5, "res_sr": 0.5 }, 
                            
                            slots: { "core": "Iron", "segment": "Steel" } 
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
        // 1. Check if schematic is already open in ANY tab
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        
        if (existingTab) {
            // Switch focus to that tab
            setActiveTabId(existingTab.id);
        } else {
            // 2. Load into CURRENT active tab
            fetchDetailsForTab(schematic, activeTabId);
        }
    };

    return (
        <section id="schematics-container" className="schematics-layout page-container active">
            
            {/* SIDEBAR */}
            <SchematicSidebar 
                indexData={indexData} 
                selectedId={activeTab?.schematic?.id}
                onSelect={handleSelect}
            />

            {/* MAIN AREA */}
            <div className="schematics-main-area">
                
                {/* 1. TABS BAR */}
                <div className="schematics-tabs-bar custom-scrollbar-x">
                    {tabs.map(tab => (
                        <div 
                            key={tab.id}
                            className={`schematic-tab ${activeTabId === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTabId(tab.id)}
                            title={tab.schematic?.name || "New Tab"}
                        >
                            <span className="tab-title">
                                {tab.schematic ? tab.schematic.name : "New Tab"}
                            </span>
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

                {/* 2. CONTENT AREA */}
                <div className="schematics-content-area">
                    
                    {/* Loader (Scoped to Content Area) */}
                    {activeTab.loading && (
                        <div className="modal-loader" style={{position: 'absolute', inset: 0, borderRadius: '4px', zIndex: 20}}>
                            <div className="spinner"></div>
                            <div className="loader-text">READING BLUEPRINT...</div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!activeTab.schematic && !activeTab.loading && (
                        <div className="empty-state">
                            <i className="fa-solid fa-microchip"></i>
                            <h2>No Schematic Selected</h2>
                            <p>Select a blueprint from the index to begin analysis.</p>
                        </div>
                    )}

                    {/* Schematic Data Render */}
					{!activeTab.loading && activeTab.schematic && activeTab.details && (
						<div className="schematic-content">
							
							{/* 1. Header */}
							<div className="schematic-header">
								<h2 className="schematic-title">{activeTab.schematic.name}</h2>
							</div>

							{/* 2. Specs Container (Flex Row) */}
							<div className="specs-container">
								
								{/* LEFT COLUMN (50% Width) - Holds Meta + Ingredients */}
								<div className="specs-left-column">
									
									{/* A. Meta Data Table */}
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
													<td className="info-value">{activeTab.details.complexity}</td>
												</tr>
												<tr>
													<td className="info-label">Quality</td>
													<td className={`info-value ${
														Object.keys(activeTab.details.experiment_weights || {}).length > 0 
															? 'quality-high' 
															: 'quality-low'
													}`}>
														{Object.keys(activeTab.details.experiment_weights || {}).length > 0 
															? "High" 
															: "Low"}
													</td>
												</tr>
											</tbody>
										</table>
									</div>

									{/* B. Ingredients Table */}
									<div className="info-table-wrapper">
										<div className="table-header">Ingredients</div>
										<table className="schematic-info-table">
											<tbody>
												{activeTab.details.slots && Object.entries(activeTab.details.slots).length > 0 ? (
													Object.entries(activeTab.details.slots).map(([key, type]) => (
														<tr key={key}>
															{/* Using key as slot name for now (e.g. "core") */}
															{/* In real app, we'd map "core" -> "Armor Core" */}
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

								</div>

								{/* RIGHT COLUMN (50% Width) - Empty for now */}
								<div style={{flex: '0 0 50%'}}>
									{/* Placeholder for future Schematic Image or Graph */}
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