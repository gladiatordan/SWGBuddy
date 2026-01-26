import { useMemo } from 'react';

/**
 * Hydrates the "Ranked IDs" list from the schematic JSON
 * with the full "Resource Data" from the ResourceContext.
 * * Returns an object keyed by ingredient name:
 * {
 * "Fruit": { best: [...], current: [...] },
 * "Corn": { best: [...], current: [...] }
 * }
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

        // Iterate over each Ingredient Group in the rankings (e.g., "fruit", "corn")
        Object.entries(schematicDetails.rankings).forEach(([ingredientName, comboMap]) => {
            
            // Get the specific ranking list for this Experiment Combo
            // Fallback to empty if this specific combo hasn't been pre-calculated
            const rankingGroup = comboMap[cacheKey] || { best: [], current: [] };

            // Hydration Helper
            const hydrateList = (rankedItems) => {
                if (!rankedItems || !Array.isArray(rankedItems)) return [];

                return rankedItems.map(item => {
                    const fullResource = resources.find(r => r.id === item.id);
                    if (!fullResource) return null;

                    // CLONE and OVERRIDE
                    // We inject the schematic-specific score into 'res_weight_rating'
                    // so ResourceRow displays the relevant percentage.
                    return {
                        ...fullResource,
                        res_weight_rating: item.raw_score, 
                        // We also attach the breakdown stats if needed for tooltips later
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