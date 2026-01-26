import { useMemo } from 'react';

/**
 * Hydrates the lightweight "Ranked IDs" list from the schematic cache
 * with the heavy "Full Resource Data" from the ResourceContext.
 * * @param {Array} resources - The full list of resources from ResourceContext (history).
 * @param {Object} schematicDetails - The active schematic details object containing 'rankings' and 'experimental_categories'.
 * @returns {Object} { current_resources, best_resources } - Hydrated arrays ready for the UI.
 */
export const useSchematicRanker = (resources, schematicDetails) => {
    return useMemo(() => {
        // Safe defaults if data isn't loaded yet
        if (!resources || !schematicDetails || !schematicDetails.rankings) {
            return { current_resources: [], best_resources: [] };
        }

        // 1. Calculate the Cache Key based on Active Toggles
        // We filter for selected categories, extract their IDs, sort them alphabetically, and join with pipes.
        // This matches the key generation logic in RankingService.py.
        const activeCategoryIds = (schematicDetails.experimental_categories || [])
            .filter(cat => cat.selected)
            .map(cat => cat.id)
            .sort();

        // If no categories exist or are selected, fallback to 'default' (or empty)
        const cacheKey = activeCategoryIds.length > 0 ? activeCategoryIds.join('|') : 'default';

        // 2. Retrieve the Ranked Data (Lean List)
        // Expected Structure: { current: [{id: 1, rating: "98.5%", slot: "Core"}], best: [...] }
        const rankingGroup = schematicDetails.rankings[cacheKey];

        if (!rankingGroup) {
            // If this specific combination hasn't been pre-calculated or doesn't exist
            return { current_resources: [], best_resources: [] };
        }

        // 3. Hydration Helper
        // Merges the "Schematic Specifics" (Rating, Slot) with "Resource Specifics" (Name, Stats, Type)
        const hydrateList = (rankedItems) => {
            if (!rankedItems || !Array.isArray(rankedItems)) return [];

            return rankedItems.map(item => {
                // Handle case where cache might be just IDs (older version) or Objects (newer version)
                const resourceId = typeof item === 'object' ? item.id : item;
                const specificData = typeof item === 'object' ? item : {};

                // Find the full resource record in memory
                const fullResource = resources.find(r => r.id === resourceId);

                if (!fullResource) {
                    // Resource might be too old or not synced yet. 
                    // We can return a placeholder or null to filter it out.
                    return null;
                }

                return {
                    ...fullResource,           // Name, Type, Stats, Date
                    rating: specificData.rating || '-', // Schematic-specific Rating
                    displaySlot: specificData.slot || fullResource.type // Contextual Slot Name
                };
            }).filter(Boolean); // Remove nulls (missing resources)
        };

        return {
            current_resources: hydrateList(rankingGroup.current),
            best_resources: hydrateList(rankingGroup.best)
        };

    }, [resources, schematicDetails]);
};