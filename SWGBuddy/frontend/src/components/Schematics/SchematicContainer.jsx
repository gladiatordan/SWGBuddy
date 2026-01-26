import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import SchematicSidebar from './SchematicSidebar';
import { STAT_MAPPING } from '../../utils/resourceUtils';
import { useResources } from '../../hooks/useResources';
import { useSchematicRanker } from '../../hooks/useSchematicRanker';

const SchematicContainer = () => {
    const { selectedServer } = useServer();
    const { resources: allResources } = useResources();
    
    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true);

    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false, activeSubTab: 'best' }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Use Ranker Hook
    const { current_resources } = useSchematicRanker(allResources, activeTab?.details);

    // Helpers
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

    // Load Index
    useEffect(() => {
        const loadIndex = async () => {
            setIsIndexLoading(true);
            try {
                // In production, fetch this from API.fetchSchematicIndex()
                // For now, using your mock structure logic based on RankingService
                const mockData = [
                    { id: 'dessert_air_cake', name: 'Air Cake', profession: 'Chef', category: 'food' }
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

    // Tab Handlers
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
            setTabs([{ id: resetId, schematic: null, details: null, loading: false, activeSubTab: 'best' }]);
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

    const fetchDetailsForTab = async (schematic, tabId) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, schematic, loading: true } : t));

        try {
            // Mock Fetching the JSON content
            // In prod: const data = await API.fetchSchematic(schematic.id);
            // Simulating the Dessert Air Cake JSON structure
            setTimeout(() => {
                const rawData = {
                    "custom_object_name": "Air Cake",
                    "base_profession": "Chef",
                    "category": "food",
                    "certification": "Novice Chef",
                    "complexity": 3,
                    "experience": 80,
                    "slots": {
                        "Carbosyrup": { "slot_type": 1, "ingredient": "shared_ingredient_carbosyrup", "quantity": 1 },
                        "Dough": { "slot_type": 1, "ingredient": "shared_ingredient_ball_of_dough", "quantity": 1 },
                        "Fruit Core": { "slot_type": 0, "ingredient": "fruit", "quantity": 20 },
                        "Additive": { "slot_type": 3, "ingredient": "shared_additive_light", "quantity": 1 }
                    },
                    "experiment_weights": {
                        "Experimental Nutritional Value": { "res_quality": 0.33, "res_potential_energy": 0.66 },
                        "Experimental Flavor": { "res_flavor": 0.66, "res_quality": 0.33 },
                        "Experimental Quantity": { "res_decay_resist": 0.25, "res_potential_energy": 0.75 },
                        "Experimental Filling": { "res_decay_resist": 0.75, "res_quality": 0.25 }
                    }
                };

                // Transform Raw Data to UI State
                const transformedCats = Object.entries(rawData.experiment_weights).map(([label, weights]) => ({
                    id: `exp_${label.toLowerCase().replace(/ /g, '_')}`,
                    label: label,
                    weights: weights,
                    selected: true // Default to all selected
                }));

                setTabs(prev => prev.map(t => 
                    t.id === tabId ? { 
                        ...t, 
                        loading: false,
                        details: { 
                            ...rawData,
                            experimental_categories: transformedCats,
                            // Rankings (Mock for now, would come from Cache in prod)
                            best_resources: [], 
                            current_resources: [] 
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
        if (existingTab) setActiveTabId(existingTab.id);
        else fetchDetailsForTab(schematic, activeTabId);
    };

    const handleToggleCategory = (tabId, catId) => {
        setTabs(prev => prev.map(tab => {
            if (tab.id !== tabId) return tab;
            const updatedCats = tab.details.experimental_categories.map(cat => 
                cat.id === catId ? { ...cat, selected: !cat.selected } : cat
            );
            return { ...tab, details: { ...tab.details, experimental_categories: updatedCats } };
        }));
    };

    const formatWeights = (weights) => {
        return Object.entries(weights)
            .map(([stat, val]) => `${STAT_MAPPING[stat] || stat} ${val}%`)
            .join('   ');
    };

    const handleSubTabChange = (tabId, subTab) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, activeSubTab: subTab } : t));
    };

    // --- INGREDIENT RENDERING LOGIC ---
    const renderIngredients = (slots) => {
        if (!slots) return <tr><td colSpan="2">No ingredients</td></tr>;

        // 1. Sort by slot_type 0 -> 4
        const sortedSlots = Object.entries(slots).sort(([, a], [, b]) => a.slot_type - b.slot_type);

        return sortedSlots.map(([slotName, data]) => {
            let displayString = "";
            let tooltip = null;

            // Logic based on Slot Type Rules
            switch (data.slot_type) {
                case 0:
                    // "<quantity> units of <ingredient>"
                    // Note: ingredient is the raw enum/label from JSON
                    displayString = `${data.quantity} units of ${data.ingredient}`;
                    break;
                case 1:
                    displayString = `${data.quantity} identical ${data.ingredient.replace(/shared_ingredient_|shared_/g, '').replace(/_/g, ' ')}`;
                    tooltip = "Identical means all components in this slot must share the same serial number (e.g., from a factory crate).";
                    break;
                case 2:
                    displayString = `${data.quantity} similar ${data.ingredient.replace(/shared_ingredient_|shared_/g, '').replace(/_/g, ' ')}`;
                    tooltip = "Similar means all components in this slot must share the same creator, but not necessarily the same serial number.";
                    break;
                case 3:
                    displayString = `(Optional) ${data.quantity} identical ${data.ingredient.replace(/shared_ingredient_|shared_/g, '').replace(/_/g, ' ')}`;
                    tooltip = "Identical means all components in this slot must share the same serial number (e.g., from a factory crate).";
                    break;
                case 4:
                    displayString = `(Optional) ${data.quantity} similar ${data.ingredient.replace(/shared_ingredient_|shared_/g, '').replace(/_/g, ' ')}`;
                    tooltip = "Similar means all components in this slot must share the same creator, but not necessarily the same serial number.";
                    break;
                default:
                    displayString = `${data.quantity} ${data.ingredient}`;
            }

            return (
                <tr key={slotName}>
                    <td className="ingredient-slot" style={{textTransform: 'capitalize'}}>
                        {slotName}
                    </td>
                    <td className="ingredient-type">
                        {displayString}
                        {tooltip && (
                            <i 
                                className="fa-solid fa-circle-question info-tooltip-icon" 
                                title={tooltip}
                                style={{ marginLeft: '8px' }}
                            ></i>
                        )}
                    </td>
                </tr>
            );
        });
    };

    const renderResourceRows = (resources) => {
        if (!resources || resources.length === 0) {
            return <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px', color: 'var(--text-dim)'}}>No resources found</td></tr>;
        }
        return resources.map(res => (
            <tr key={res.id}>
                <td className="info-value" style={{textAlign: 'left'}}>{res.name}</td>
                <td className="info-value" style={{textAlign: 'left'}}>{res.displaySlot || '-'}</td>
                <td className="info-value">{res.stats || '-'}</td>
                <td className="info-value quality-high">{res.rating || '-'}</td>
                <td className="info-value" style={{color: 'var(--text-dim)'}}>{res.date || '-'}</td>
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
                            <button className="close-tab-btn" onClick={(e) => handleCloseTab(e, tab.id)}>
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>
                    ))}
                    {tabs.length < 10 && (
                        <button className="add-tab-btn" onClick={handleAddTab} title="New Tab"><i className="fa-solid fa-plus"></i></button>
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
                                <div className="specs-left-column" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    
                                    {/* Specifications */}
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
                                                    <td className="info-value" title={activeTab.details.certification}>{activeTab.details.certification}</td>
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
                                                        <i className="fa-solid fa-circle-question info-tooltip-icon" title={getComplexityRequirements(activeTab.details.complexity)}></i>
                                                    </td>
                                                </tr>
                                                {(() => {
                                                    const isHigh = activeTab.details.experimental_categories && activeTab.details.experimental_categories.length > 0;
                                                    return (
                                                        <tr>
                                                            <td className="info-label">Quality</td>
                                                            <td className={`info-value ${isHigh ? 'quality-high' : 'quality-low'}`}>
                                                                {isHigh ? "High" : "Low"}
                                                                <i className="fa-solid fa-circle-question info-tooltip-icon" title={getQualityTooltip(isHigh)}></i>
                                                            </td>
                                                        </tr>
                                                    );
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Ingredients (Updated Logic) */}
                                    <div className="info-table-wrapper">
                                        <div className="table-header">Ingredients</div>
                                        <table className="schematic-info-table">
                                            <tbody>
                                                {renderIngredients(activeTab.details.slots)}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Experimental Categories */}
                                    <div className="info-table-wrapper" style={{gridColumn: '1 / -1', width: '46.5%'}}>
                                        <div className="table-header">Experimental Categories</div>
                                        <div className="exp-cat-list">
                                            {activeTab.details.experimental_categories && activeTab.details.experimental_categories.length > 0 ? (
                                                activeTab.details.experimental_categories.map((cat) => (
                                                    <div key={cat.id} className={`exp-cat-item ${cat.selected ? 'selected' : 'dimmed'}`}>
                                                        <div className="exp-cat-header">
                                                            <span className="exp-cat-label">{cat.label}</span>
                                                            <label className="toggle-switch">
                                                                <input type="checkbox" checked={cat.selected} onChange={() => handleToggleCategory(activeTab.id, cat.id)} />
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
                                <div style={{flex: '0 0 50%'}}></div>
                            </div>

                            {/* Resource Tabs */}
                            <div className="resource-tabs-section" style={{width: '100%', marginTop: '20px'}}>
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
                                                : renderResourceRows(current_resources) 
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