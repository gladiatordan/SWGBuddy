import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../services/api';

export const useResources = (serverId = 'cuemu') => {
    const [rawResources, setRawResources] = useState([]);
	const [cache, setCache] = useState({
        taxonomy: {},
        valid_resources: {},
        filter_list: {}
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const lastSyncRef = useRef(0);
    const intervalRef = useRef(null);

    // Initial Load & Taxonomy
    useEffect(() => {
        const init = async () => {
            try {
                // fetch taxonomy for current active server
                const taxData = await API.fetchTaxonomy(serverId);
                
                // Note: Ensure you are setting 'cache' here if you updated the variable name
                // based on our previous step (setCache vs setTaxonomy). 
                // If you kept it as setTaxonomy for now:
                setCache(taxData); 
                
                await fetchResources(false); // Full Sync
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        init();
        
        // Start Polling on mount
        startPolling();

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
                if (isDelta) {
                    // Merge Logic
                    setRawResources(prev => {
                        const newMap = new Map(prev.map(r => [r.id, r]));
                        data.resources.forEach(r => newMap.set(r.id, r));
                        return Array.from(newMap.values());
                    });
                } else {
                    setRawResources(data.resources);
                }
                lastSyncRef.current = Date.now() / 1000;
            }
        } catch (err) {
            console.error("Poll failed", err);
        }
    };

    // Manual Refresh triggers fetch AND resets timer
    const refresh = async () => {
        startPolling(); // Resets timer
        await fetchResources(true);
    };

    // Optimistic Update Helper
    const updateLocalResource = (updatedRes) => {
        setRawResources(prev => prev.map(r => r.id === updatedRes.id ? updatedRes : r));
    };

    // Actions
    const toggleStatus = async (resource) => {
        const newState = !resource.is_active;
        // Optimistic
        const updated = { ...resource, is_active: newState };
        updateLocalResource(updated);
        
        try {
            const { planet, planets, ...payload } = updated;
            await API.updateResource(payload, serverId);
            refresh(); // Use new refresh that resets timer
        } catch (err) {
            console.error("Update failed", err);
            updateLocalResource(resource); // Revert
            alert("Failed to update status");
        }
    };

    const togglePlanet = async (resource, planetName) => {
        let currentPlanets = resource.planet || resource.planets || [];
        if (!Array.isArray(currentPlanets)) currentPlanets = [currentPlanets];

        const exists = currentPlanets.includes(planetName);
        let newPlanets;
        
        if (exists) {
            newPlanets = currentPlanets.filter(p => p !== planetName);
        } else {
            newPlanets = [...currentPlanets, planetName];
        }

        const updated = { ...resource, planet: newPlanets };
        updateLocalResource(updated);

        try {
            await API.updateResource({ ...resource, planet: planetName }, serverId); 
            refresh(); // Use new refresh
        } catch (err) {
            console.error("Planet toggle failed", err);
            updateLocalResource(resource); 
        }
    };

    return {
        resources: rawResources, 
        cache,
        loading,
        error,
        actions: { toggleStatus, togglePlanet, refresh }
    };
};

// Helper just to pass raw data through (React state handles the array)
const rawResourceDataToRender = (data) => data;