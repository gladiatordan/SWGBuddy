// src/contexts/ResourceContext.jsx
import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import API from '../services/api';

export const ResourceContext = createContext();

export const ResourceProvider = ({ children, serverId }) => {
    const [rawResources, setRawResources] = useState([]);
    const [cache, setCache] = useState({
        taxonomy: {},
        valid_resources: {},
        filter_list: {}
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Track synchronization state
    const lastSyncRef = useRef(0);
    const intervalRef = useRef(null);

    // Initial Load & Taxonomy
    useEffect(() => {
        // Reset state when server changes
        setRawResources([]);
        setLoading(true);
        lastSyncRef.current = 0;

        const init = async () => {
            try {
                const taxData = await API.fetchTaxonomy(serverId);
                setCache(taxData);
                await fetchResources(false); // Full Sync
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (serverId) {
            init();
            startPolling();
        }

        return () => stopPolling();
    }, [serverId]);

    const startPolling = useCallback(() => {
        stopPolling();
        intervalRef.current = setInterval(() => {
            fetchResources(true); // Delta Sync
        }, 15000);
    }, [serverId]);

    const stopPolling = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const fetchResources = async (isDelta = false) => {
        try {
            const since = isDelta ? lastSyncRef.current : 0;
            const data = await API.fetchResources(serverId, since);
            
            if (data.resources) {
                if (isDelta && data.resources.length > 0) {
                    setRawResources(prev => {
                        const newMap = new Map(prev.map(r => [r.id, r]));
                        data.resources.forEach(r => newMap.set(r.id, r));
                        return Array.from(newMap.values());
                    });
                } else if (!isDelta) {
                    setRawResources(data.resources);
                }
                // Always update timestamp if fetch successful
                lastSyncRef.current = Date.now() / 1000;
            }
        } catch (err) {
            console.error("Poll failed", err);
        }
    };

    const refresh = async () => {
        startPolling(); 
        await fetchResources(true);
    };

    // Actions passed down to components
    const actions = {
        toggleStatus: async (resource) => {
            /* ... (Copy logic from useResources.js) ... */
            // Simplified for brevity - implement same logic as before
            const updated = { ...resource, is_active: !resource.is_active };
            setRawResources(prev => prev.map(r => r.id === resource.id ? updated : r));
            try {
                const { planet, planets, ...payload } = updated;
                await API.updateResource(payload, serverId);
                refresh();
            } catch (err) {
                console.error(err);
            }
        },
        togglePlanet: async (resource, planetName) => {
             /* ... (Copy logic from useResources.js) ... */
             // Simplified
             let current = resource.planet || [];
             if (!Array.isArray(current)) current = [current];
             const newPlanets = current.includes(planetName) 
                ? current.filter(p => p !== planetName) 
                : [...current, planetName];
             
             const updated = { ...resource, planet: newPlanets };
             setRawResources(prev => prev.map(r => r.id === resource.id ? updated : r));
             try {
                 await API.updateResource({ ...resource, planet: planetName }, serverId);
                 refresh();
             } catch (err) { console.error(err); }
        },
        refresh
    };

    return (
        <ResourceContext.Provider value={{ resources: rawResources, cache, loading, error, actions }}>
            {children}
        </ResourceContext.Provider>
    );
};