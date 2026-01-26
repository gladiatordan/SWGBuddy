import { useMemo } from 'react';

/**
 * Hydrates the "Ranked IDs" list from the schematic JSON
 * with the full "Resource Data" from the ResourceContext.
 */
export const useSchematicRanker = (resources, schematicDetails) => {
    return useMemo(() => {
        // Safe defaults
        if (!resources || !schematicDetails || !schematicDetails.rankings) {
            return {};
        }

        // 1. Calculate the Cache Key (Experiment Combo)
        const activeCategoryIds = (schematicDetails.experimental_categories || [])
            .filter(cat => cat.selected)
            .map(cat => cat.id)
            .sort();

        const cacheKey = activeCategoryIds.length > 0 ? activeCategoryIds.join('|') : 'default';

        // 2. Build the Hydrated Map
        const hydratedResult = {};

        Object.entries(schematicDetails.rankings).forEach(([ingredientName, comboMap]) => {
            
            // Get the specific ranking list for this Experiment Combo
            const rankingGroup = comboMap[cacheKey] || { best: [], current: [] };

            // Hydration Helper
            const hydrateList = (rankedItems) => {
                if (!rankedItems || !Array.isArray(rankedItems)) return [];

                return rankedItems.map(item => {
                    // FIX: Ensure ID comparison is type-safe (String vs String)
                    const fullResource = resources.find(r => String(r.id) === String(item.id));
                    
                    // If the resource exists in our DB, merge it. 
                    // If not, we skip it (or you could return a skeleton object if you prefer)
                    if (!fullResource) return null;

                    return {
                        ...fullResource,
                        res_weight_rating: item.raw_score, 
                        _ranking_stats: item.stats 
                    };
                }).filter(Boolean);
            };

            hydratedResult[ingredientName] = {
                best: hydrateList(rankingGroup.best),
                current: hydrateList(rankingGroup.current)
            };
        });

        return hydratedResult;

    }, [resources, schematicDetails]);
};