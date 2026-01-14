import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../services/api';

export const useResources = (serverId = 'cuemu') => {
    const [rawResources, setRawResources] = useState([]);
    const [taxonomy, setTaxonomy] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const lastSyncRef = useRef(0);

    // Initial Load & Taxonomy
    useEffect(() => {
        const init = async () => {
            try {
                const taxData = await API.fetchTaxonomy();
                setTaxonomy(taxData);
                await fetchResources(false); // Full Sync
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [serverId]);

    // Polling
    useEffect(() => {
        const interval = setInterval(() => {
            fetchResources(true); // Delta Sync
        }, 15000);
        return () => clearInterval(interval);
    }, [serverId]);

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
            // Remove calculated fields for payload
            const { planet, planets, ...payload } = updated;
            await API.updateResource(payload, serverId);
            fetchResources(true); // Re-sync to confirm
        } catch (err) {
            console.error("Update failed", err);
            updateLocalResource(resource); // Revert
            alert("Failed to update status");
        }
    };

    const togglePlanet = async (resource, planetName) => {
		// console.log("Toggle Planet Resource:", resource);
        let currentPlanets = resource.planet || resource.planets || [];
        // Ensure array
        if (!Array.isArray(currentPlanets)) currentPlanets = [currentPlanets];

        const exists = currentPlanets.includes(planetName);
        let newPlanets;
        
        if (exists) {
            // Remove
            newPlanets = currentPlanets.filter(p => p !== planetName);
        } else {
            // Add
            newPlanets = [...currentPlanets, planetName];
        }

        // Optimistic
        const updated = { ...resource, planet: newPlanets };
        updateLocalResource(updated);

        try {
            // API expects "planet" to be the *single change* or the list? 
            // Looking at original code: it sends `planet: newPlanet` for ADD logic.
            // But `handleBadgeClick` sends `planet: planetValue` for REMOVE logic?
            // Wait, the backend likely handles the toggle based on context or the original code was tricky.
            // Let's mimic original api.js: updateResource takes the payload.
            // Original code sent `{ ...resource, planet: newPlanet }`.
            // We will send the payload expected by your backend.
            await API.updateResource({ ...resource, planet: planetName }, serverId); 
            fetchResources(true);
        } catch (err) {
            console.error("Planet toggle failed", err);
            updateLocalResource(resource); // Revert
        }
    };

    return {
        resources: rawResourceDataToRender(rawResources), // Just pass raw for now
        taxonomy,
        loading,
        error,
        actions: { toggleStatus, togglePlanet, refresh: () => fetchResources(true) }
    };
};

// Helper just to pass raw data through (React state handles the array)
const rawResourceDataToRender = (data) => data;