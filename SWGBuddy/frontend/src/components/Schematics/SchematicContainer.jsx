import React, { useState, useEffect, useRef } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import SchematicSidebar from './SchematicSidebar';
import { STAT_MAPPING } from '../../utils/resourceUtils';
import { useResources } from '../../hooks/useResources';
import { useSchematicRanker } from '../../hooks/useSchematicRanker';

// New Imports for Resource Table Logic
import ResourceRow from '../ResourceTable/ResourceRow';
import ResourceModal from '../Modals/ResourceModal';

const SchematicContainer = () => {
    const { selectedServer } = useServer();
    const { resources: allResources, cache, actions } = useResources();
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);

    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true);

    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false, activeSubTab: 'best', lastUpdated: 0 }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    const hydratedRankings = useSchematicRanker(allResources, activeTab?.details);

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

    const getIngredientLabel = (key) => {
        if (!cache?.taxonomy) return key;
        const entry = cache.taxonomy[key];
        return entry ? entry.label : key; 
    };

    // Load Index
    useEffect(() => {
        const loadIndex = async () => {
            if (!selectedServer) return;
            setIsIndexLoading(true);
            try {
                const data = await API.fetchSchematicIndex(selectedServer);
                setIndexData(data || []);
            } catch (err) {
                console.error("Failed to load schematic index", err);
                setIndexData([]);
            } finally {
                setIsIndexLoading(false);
            }
        };
        loadIndex();
    }, [selectedServer]);

    // --- REALTIME POLLING LOGIC ---
    // Use a ref to access current tabs state inside the interval without re-binding
    const tabsRef = useRef(tabs);
    useEffect(() => { tabsRef.current = tabs; }, [tabs]);

    useEffect(() => {
        if (!selectedServer) return;

        const pollForUpdates = async () => {
            const currentTabs = tabsRef.current;
            const activeSchematicIds = currentTabs
                .filter(t => t.schematic && t.schematic.id)
                .map(t => t.schematic.id);

            if (activeSchematicIds.length === 0) return;

            try {
                const updates = await API.checkSchematicUpdates(selectedServer, activeSchematicIds);
                
                Object.entries(updates).forEach(([schemaId, timestamp]) => {
                    const tabToUpdate = currentTabs.find(t => t.schematic?.id === schemaId);
                    
                    if (tabToUpdate && timestamp > (tabToUpdate.lastUpdated || 0)) {
                        console.log(`[Auto-Refresh] Updating tab for ${schemaId}`);
                        // PASS TRUE FOR SILENT UPDATE
                        fetchDetailsForTab(tabToUpdate.schematic, tabToUpdate.id, true);
                    }
                });
            } catch (err) {
                console.warn("Polling failed", err);
            }
        };

        // Poll every 30 seconds
        const intervalId = setInterval(pollForUpdates, 30000);
        return () => clearInterval(intervalId);
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

    const fetchDetailsForTab = async (schematic, tabId, isSilent = false) => {
        // Only show full loader if NOT silent
        if (!isSilent) {
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, schematic, loading: true } : t));
        }

        try {
            if (!selectedServer) throw new Error("No server selected");

            const rawData = await API.fetchSchematicDetails(schematic.id, selectedServer);

            const transformedCats = Object.entries(rawData.experiment_weights || {}).map(([label, weights]) => ({
                id: `exp_${label.toLowerCase().replace(/ /g, '_')}`,
                label: label,
                weights: weights,
                // Preserve selection state if updating existing tab
                selected: true 
            }));

            setTabs(prev => prev.map(t => {
                if (t.id !== tabId) return t;

                // If silent update, we want to preserve the user's current category selection
                // instead of resetting everything to 'selected: true'
                let finalCats = transformedCats;
                if (isSilent && t.details && t.details.experimental_categories) {
                    const oldSel = t.details.experimental_categories.reduce((acc, c) => {
                        acc[c.id] = c.selected;
                        return acc;
                    }, {});
                    
                    finalCats = transformedCats.map(c => ({
                        ...c,
                        selected: oldSel[c.id] !== undefined ? oldSel[c.id] : true
                    }));
                }

                return { 
                    ...t, 
                    loading: false,
                    lastUpdated: rawData.last_updated || Date.now(),
                    details: { 
                        ...rawData,
                        experimental_categories: finalCats,
                    } 
                };
            }));
        } catch (err) {
            console.error("Detail load failed", err);
            // Ensure loading is false on error so it doesn't get stuck
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t));
        }
    };

    const handleSelect = (schematic) => {
        // Standard Select (Sidebar): Replaces current tab
        fetchDetailsForTab(schematic, activeTabId);
    };

    // New: Background Open (Ingredient Link)
    const handleBackgroundOpen = (schematic) => {
        // 1. Check if already open
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        if (existingTab) {
            return; // Already open, do nothing (keep current active)
        }

        // 2. Open new tab
        if (tabs.length >= 10) {
            alert("Maximum tabs reached. Please close one to open this link.");
            return;
        }

        const newId = Date.now();
        // Add the tab, but do NOT set ActiveTabId
        setTabs(prev => [...prev, { 
            id: newId, 
            schematic: schematic, 
            details: null, 
            loading: true, 
            activeSubTab: 'best' 
        }]);

        // Trigger fetch for the new tab ID
        fetchDetailsForTab(schematic, newId);
    };

    // --- RENDERERS ---

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
            .map(([stat, val]) => `${STAT_MAPPING[stat] || stat} ${val * 100}%`)
            .join('   ');
    };

    const handleSubTabChange = (tabId, subTab) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, activeSubTab: subTab } : t));
    };

    const handleResourceClick = (resource) => {
        setSelectedResource(resource);
        setIsModalOpen(true);
    };

    const handleModalSave = async () => {
        await actions.refresh();
    };

    const renderIngredients = (slots) => {
        if (!slots) return <tr><td colSpan="2">No ingredients</td></tr>;
        const sortedSlots = Object.entries(slots).sort(([, a], [, b]) => a.slot_type - b.slot_type);

        return sortedSlots.map(([slotName, data]) => {
            let displayString = null;
            let tooltip = null;
            const ingredientName = getIngredientLabel(data.ingredient);

            // --- LINKING LOGIC ---
            // Check if this is a sub-component (Slot Type != 0) AND exists in our index
            let linkedSchematic = null;
            if (data.slot_type !== 0) {
                // Find matching schematic by name (case insensitive matching is safer)
                linkedSchematic = indexData.find(item => 
                    item.name.toLowerCase() === data.ingredient.toLowerCase()
                );
            }

            // Helper to wrap text in a link if applicable
            const wrapLink = (text) => {
                if (linkedSchematic) {
                    return (
                        <span 
                            className="schematic-ingredient-link" 
                            title={`Open ${linkedSchematic.name} in new tab`}
                            onClick={(e) => {
                                e.stopPropagation(); 
                                handleBackgroundOpen(linkedSchematic);
                            }}
                            style={{ 
                                color: 'var(--accent-blue)', 
                                cursor: 'pointer', 
                                textDecoration: 'underline',
                                fontWeight: '500'
                            }}
                        >
                            {text} <i className="fa-solid fa-arrow-up-right-from-square" style={{fontSize: '0.7em', marginLeft: '4px'}}></i>
                        </span>
                    );
                }
                return text;
            };

            switch (data.slot_type) {
                case 0:
                    displayString = <span>{data.quantity} units of {ingredientName}</span>;
                    break;
                case 1:
                    displayString = (
                        <span>
                            {data.quantity} {data.quantity > 1 ? 'identical ' : ''}
                            {wrapLink(ingredientName)}
                        </span>
                    );
                    if (data.quantity > 1) tooltip = "Identical means all components in this slot must share the same serial number.";
                    break;
                case 2:
                    displayString = (
                        <span>
                            {data.quantity} {data.quantity > 1 ? 'similar ' : ''}
                            {wrapLink(ingredientName)}
                        </span>
                    );
                    if (data.quantity > 1) tooltip = "Similar means all components in this slot must share the same creator.";
                    break;
                case 3:
                    displayString = (
                        <span>
                            (Optional) {data.quantity} {data.quantity > 1 ? 'identical ' : ''}
                            {wrapLink(ingredientName)}
                        </span>
                    );
                    if (data.quantity > 1) tooltip = "Identical means all components in this slot must share the same serial number.";
                    break;
                case 4:
                    displayString = (
                        <span>
                            (Optional) {data.quantity} {data.quantity > 1 ? 'similar ' : ''}
                            {wrapLink(ingredientName)}
                        </span>
                    );
                    if (data.quantity > 1) tooltip = "Similar means all components in this slot must share the same creator.";
                    break;
                default:
                    displayString = <span>{data.quantity} {wrapLink(ingredientName)}</span>;
            }

            return (
                <tr key={slotName}>
                    <td className="ingredient-slot" style={{textTransform: 'capitalize'}}>{slotName}</td>
                    <td className="ingredient-type">
                        {displayString}
                        {tooltip && <i className="fa-solid fa-circle-question info-tooltip-icon" title={tooltip} style={{ marginLeft: '8px' }}></i>}
                    </td>
                </tr>
            );
        });
    };

    const renderRankingTable = (ingredientName, resources) => {
        const decodedTitle = getIngredientLabel(ingredientName);

        if (!resources || resources.length === 0) {
            return (
                <div key={ingredientName} className="slot-group-empty">
                     <h4 className="slot-header">{decodedTitle}</h4>
                     <div className="empty-message">No matching resources found for this configuration.</div>
                </div>
            );
        }

        return (
            <div key={ingredientName} className="slot-group-container" style={{ marginBottom: '30px' }}>
                <h4 className="slot-header" style={{ 
                    fontSize: '16px', 
                    color: 'var(--accent-blue)', 
                    marginBottom: '10px', 
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border-dim)',
                    paddingBottom: '5px'
                }}>
                    {decodedTitle}
                </h4>
                
                <div className="table-scroll-wrapper">
                    <table className="resource-table">
                        <thead>
                            <tr>
                                <th className="col-name">NAME</th>
                                <th className="col-type">TYPE</th>
                                <th className="col-stat">Score</th>
                                {['OQ','CR','CD','DR','FL','HR','MA','PE','SR','UT'].map(s => (
                                    <th key={s} className="col-stat">{s}</th>
                                ))}
                                <th className="col-loc">LOCATION</th>
                                <th className="col-date">AGE</th>
                                <th className="col-status">STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resources.map(res => (
                                <ResourceRow 
                                    key={res.id} 
                                    resource={res}
                                    isEditor={false}
                                    taxonomy={cache?.taxonomy || {}}
                                    onClick={handleResourceClick}
                                    onToggleStatus={() => {}} 
                                    onTogglePlanet={() => {}}
                                    showAge={true}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <section id="schematics-container" className="schematics-layout page-container active">
            
            <SchematicSidebar 
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
                                                    <td className="info-label">Certification Required</td>
                                                    <td className="info-value">{activeTab.details.certification}</td>
                                                </tr>
                                                <tr>
                                                    <td className="info-label">Assembly Skill</td>
                                                    <td className="info-value">{activeTab.details.assembly_skill}</td>
                                                </tr>
                                                <tr>
                                                    <td className="info-label">Experimentation Skill</td>
                                                    <td className="info-value">{activeTab.details.experimentation_skill}</td>
                                                </tr>
                                                <tr>
                                                    <td className="info-label">Customization Skill</td>
                                                    <td className="info-value">{activeTab.details.customization_skill || '-'}</td>
                                                </tr>
                                                <tr>
                                                    <td className="info-label">Experience Type</td>
                                                    <td className="info-value">{activeTab.details.experience_type}</td>
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

                                    {/* Ingredients Summary */}
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

                            {/* Resource Ranking Tables Section */}
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
                                
                                <div className="resource-tab-content" style={{ padding: '15px' }}>
                                    {Object.entries(hydratedRankings)
                                        .sort((a, b) => a[0].localeCompare(b[0]))
                                        .map(([ingredientName, data]) => {
                                            const resourcesToUse = activeTab.activeSubTab === 'best' 
                                                ? data.best 
                                                : data.current;
                                            
                                            return renderRankingTable(ingredientName, resourcesToUse);
                                        })
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ResourceModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                resource={selectedResource}
                onSave={handleModalSave}
            />
        </section>
    );
};

export default SchematicContainer;