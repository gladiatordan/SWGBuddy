// frontend/src/components/Schematics/SchematicContainer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
	const [searchParams, setSearchParams] = useSearchParams();
    const { selectedServer } = useServer();
    const { resources: allResources, cache, actions } = useResources();
    
    // --- State Management ---
    // Instead of simple booleans, we can derive modal state from URL or sync URL to state
    // For smoother UI, we keep local state and sync TO URL when changed.
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const [indexData, setIndexData] = useState([]);
    const [isIndexLoading, setIsIndexLoading] = useState(true);

    const [tabs, setTabs] = useState([
        { id: 1, schematic: null, details: null, loading: false, activeSubTab: 'best', lastUpdated: 0 }
    ]);
    const [activeTabId, setActiveTabId] = useState(1);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const hydratedRankings = useSchematicRanker(allResources, activeTab?.details);

	// --- URL SYNC HELPERS ---
    
    // Helper to update params without losing 'server'
    const updateParams = (updates) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, val]) => {
                if (val === null || val === undefined) {
                    newParams.delete(key);
                } else {
                    newParams.set(key, val);
                }
            });
            // Ensure server is always set if we have it in context
            if (selectedServer) newParams.set('server', selectedServer);
            return newParams;
        }, { replace: true });
    };

    // --- INITIALIZATION & ROUTING EFFECTS ---
	const openAndFocusSchematic = (schematic) => {
        // 1. If already open in a tab, switch to it
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        if (existingTab) {
            if (activeTabId !== existingTab.id) {
                setActiveTabId(existingTab.id);
            }
            return;
        }

        // 2. If we have a single empty tab (initial state), reuse it
        if (tabs.length === 1 && !tabs[0].schematic) {
            const firstTabId = tabs[0].id;
            setActiveTabId(firstTabId);
            fetchDetailsForTab(schematic, firstTabId);
            return;
        }

        // 3. Otherwise, open a new tab and focus it
        if (tabs.length >= 10) {
            // Max tabs reached: Reuse active tab as fallback
            fetchDetailsForTab(schematic, activeTabId);
        } else {
            const newId = Date.now();
            setTabs(prev => [...prev, { id: newId, schematic: schematic, details: null, loading: true, activeSubTab: 'best' }]);
            setActiveTabId(newId);
            fetchDetailsForTab(schematic, newId);
        }
    };

    // 1. Load Index
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

    // 2. Handle URL Routing (Deep Links)
    useEffect(() => {
        // Wait for index to load before attempting to resolve ID
        if (isIndexLoading) return;

        const idFromUrl = searchParams.get('id');
        const modalFromUrl = searchParams.get('modal');

        // Handle Schematic ID
        if (idFromUrl) {
            // If the URL has an ID, and the active tab isn't showing it...
            if (!activeTab.schematic || activeTab.schematic.id !== idFromUrl) {
                // Find it in the index
                const schem = indexData.find(i => i.id === idFromUrl);
                if (schem) {
                    openAndFocusSchematic(schem);
                }
            }
        }

        // Handle Modals
        if (modalFromUrl === 'add') {
            if (!isAddModalOpen) setIsAddModalOpen(true);
        } else if (modalFromUrl === 'resource') {
            const rId = searchParams.get('resourceId');
            // Logic to open resource modal if not open would go here
            // But we need the full resource object usually. 
            // For now, we skip deep linking specific resource modal unless we fetch it.
        } else {
            if (isAddModalOpen) setIsAddModalOpen(false);
        }

    }, [searchParams, indexData, isIndexLoading]); // Re-run when index finishes loading

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
            closeAddModal(); 
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
		updateParams({ id: null });
    };

    const handleCloseTab = (e, tabId) => {
        e.stopPropagation();
        const newTabs = tabs.filter(t => t.id !== tabId);
        if (newTabs.length === 0) {
            const resetId = Date.now();
            setTabs([{ id: resetId, schematic: null, details: null, loading: false, activeSubTab: 'best' }]);
            setActiveTabId(resetId);
			updateParams({ id: null });
        } else {
            setTabs(newTabs);
            if (activeTabId === tabId) {
                const index = tabs.findIndex(t => t.id === tabId);
                const nextTab = newTabs[index - 1] || newTabs[index] || newTabs[0];
                setActiveTabId(nextTab.id);
				updateParams({ id: nextTab.schematic?.id || null });
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
        // Select logic from Sidebar
        // 1. Check if already open
        const existingTab = tabs.find(t => t.schematic?.id === schematic.id);
        if (existingTab) {
            setActiveTabId(existingTab.id);
        } else {
            // Use current tab if empty, else new tab logic (omitted for brevity, assume current active tab target)
            fetchDetailsForTab(schematic, activeTabId);
        }
        updateParams({ id: schematic.id });
    };

	// Triggered when clicking a tab header
    const handleTabClick = (tab) => {
        setActiveTabId(tab.id);
        updateParams({ id: tab.schematic?.id || null });
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

    // --- MODAL HANDLERS ---
    
    const openAddSchematicModal = () => {
        setIsAddModalOpen(true);
        updateParams({ modal: 'add-schematic' });
    };

    const closeAddSchematicModal = () => {
        setIsAddModalOpen(false);
        updateParams({ modal: null });
    };

	const handleModalSave = async () => {
        await actions.refresh();
		closeResourceModal();
    };

    const handleResourceClick = (resource) => {
        setSelectedResource(resource);
        setIsModalOpen(true);
        updateParams({ modal: 'resource', resourceId: resource.id });
    };

    const closeResourceModal = () => {
        setIsModalOpen(false);
        updateParams({ modal: null, resourceId: null });
    };

    return (
        <section id="schematics-container" className="schematics-layout page-container active">
            
            <SchematicSidebar 
				key={refreshKey}
                selectedId={activeTab?.schematic?.id}
                onSelect={handleSelect}
				onAddClick={openAddSchematicModal}
            />

            <div className="schematics-main-area">
                <div className="schematics-tabs-bar custom-scrollbar-x">
                    {tabs.map(tab => (
                        <div 
                            key={tab.id}
                            className={`schematic-tab ${activeTabId === tab.id ? 'active' : ''}`}
                            onClick={() => handleTabClick(tab)}
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
                onClose={closeAddSchematicModal} 
                onSave={handleSaveAndRefresh}
            />
        </section>
    );
};

export default SchematicContainer;