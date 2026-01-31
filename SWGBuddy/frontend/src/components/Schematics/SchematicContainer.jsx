// frontend/src/components/Schematics/SchematicContainer.jsx
import React, { useState, useEffect, useRef } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import SchematicSidebar from './SchematicSidebar';
import { useResources } from '../../hooks/useResources';
import { useSchematicRanker } from '../../hooks/useSchematicRanker';
import AddSchematicModal from '../Modals/AddSchematicModal';

// View Component
import SchematicView from './SchematicView';
import ResourceModal from '../Modals/ResourceModal';

const SchematicContainer = () => {
    const { selectedServer } = useServer();
    const { resources: allResources, cache, actions } = useResources();
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true); // kept for potential future UI use

    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false, activeSubTab: 'best', lastUpdated: 0 }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    const hydratedRankings = useSchematicRanker(allResources, activeTab?.details);

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
                        fetchDetailsForTab(tabToUpdate.schematic, tabToUpdate.id, true);
                    }
                });
            } catch (err) {
                console.warn("Polling failed", err);
            }
        };

        const intervalId = setInterval(pollForUpdates, 30000);
        return () => clearInterval(intervalId);
    }, [selectedServer]);

	// ADDED: Save Handler
    const handleSaveSchematic = async (formData) => {
        try {
            await API.addSchematic(formData, selectedServer);
            setIsAddModalOpen(false);
            // Ideally, we trigger a refresh in Sidebar. 
            // Since Sidebar fetches its own data on mount/server change, 
            // we might want to force a remount or pass a "refreshTrigger" prop.
            // For now, simple page reload or ignoring the immediate list update 
            // might be the quickest path, but let's try a key update to force sidebar refresh:
            // (See implementation below in return statement)
        } catch (err) {
            console.error("Failed to add schematic", err);
            throw err;
        }
    };

	// Helper to force sidebar refresh
    const [refreshKey, setRefreshKey] = useState(0);
    const handleSaveAndRefresh = async (data) => {
        await handleSaveSchematic(data);
        setRefreshKey(prev => prev + 1); // Increment to re-render Sidebar
    };

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
                selected: true 
            }));

            setTabs(prev => prev.map(t => {
                if (t.id !== tabId) return t;

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
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t));
        }
    };

    const handleSelect = (schematic) => {
        fetchDetailsForTab(schematic, activeTabId);
    };

    const handleBackgroundOpen = (schematic) => {
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        if (existingTab) return;

        if (tabs.length >= 10) {
            alert("Maximum tabs reached. Please close one to open this link.");
            return;
        }

        const newId = Date.now();
        setTabs(prev => [...prev, { 
            id: newId, 
            schematic: schematic, 
            details: null, 
            loading: true, 
            activeSubTab: 'best' 
        }]);

        fetchDetailsForTab(schematic, newId);
    };

    const handleToggleCategory = (catId) => {
        setTabs(prev => prev.map(tab => {
            if (tab.id !== activeTabId) return tab;
            const updatedCats = tab.details.experimental_categories.map(cat => 
                cat.id === catId ? { ...cat, selected: !cat.selected } : cat
            );
            return { ...tab, details: { ...tab.details, experimental_categories: updatedCats } };
        }));
    };

    const handleSubTabChange = (subTab) => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, activeSubTab: subTab } : t));
    };

    const handleResourceClick = (resource) => {
        setSelectedResource(resource);
        setIsModalOpen(true);
    };

    const handleModalSave = async () => {
        await actions.refresh();
    };

    return (
        <section id="schematics-container" className="schematics-layout page-container active">
            
            <SchematicSidebar 
				key={refreshKey}
                selectedId={activeTab?.schematic?.id}
                onSelect={handleSelect}
				onAddClick={() => setIsAddModalOpen(true)}
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
                    <SchematicView 
                        schematic={activeTab.schematic}
                        details={activeTab.details}
                        loading={activeTab.loading}
                        activeSubTab={activeTab.activeSubTab}
                        hydratedRankings={hydratedRankings}
                        indexData={indexData}
						cache={cache}
                        onToggleCategory={handleToggleCategory}
                        onSubTabChange={handleSubTabChange}
                        onResourceClick={handleResourceClick}
                        onBackgroundOpen={handleBackgroundOpen}
                    />
                </div>
            </div>

            <ResourceModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                resource={selectedResource}
                onSave={handleModalSave}
            />

            <AddSchematicModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onSave={handleSaveAndRefresh}
            />
        </section>
    );
};

export default SchematicContainer;