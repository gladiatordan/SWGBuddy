// frontend/src/components/Schematics/SchematicView.jsx
import React from 'react';
import { STAT_MAPPING } from '../../utils/resourceUtils';
import ResourceRow from '../ResourceTable/ResourceRow';

const SchematicView = ({
    schematic,
    details,
    loading,
    activeSubTab,
    hydratedRankings,
    indexData,
	cache,
    onToggleCategory,
    onSubTabChange,
    onResourceClick,
    onBackgroundOpen,
    onTogglePlanet,   // Placeholder if needed for ResourceRow
    onToggleStatus    // Placeholder if needed for ResourceRow
}) => {

    // --- Helpers ---
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
        // We might want to pass taxonomy as a prop if strictly needed, 
        // but often the key is sufficient or the parent handles mapping.
        // For now, we'll use the key formatted or if the parent passes a lookup, use that.
        // Assuming the parent handled the lookup or we just display the key prettified:
        return key.replace(/_/g, ' '); 
    };
    
    // Note: If you need the exact taxonomy label from cache, pass `taxonomy` as a prop.
    // For this refactor, we will rely on the parent passing processed data or accepting raw keys
    // if the cache isn't available here. 
    // *Correction*: The original code used `cache.taxonomy`. 
    // To match legacy exactly, we should accept a `getIngredientLabel` helper or the taxonomy object.
    // Let's assume the parent passes a resolved name or we use a simple formatter here 
    // if the logic was simple.
    // *Better approach*: The original used `getIngredientLabel` which accessed `cache`.
    // We will let the View render what it's given. 
    // However, `renderIngredients` logic is complex. Let's include it here.

    const formatWeights = (weights) => {
        return Object.entries(weights)
            .map(([stat, val]) => `${STAT_MAPPING[stat] || stat} ${val * 100}%`)
            .join('   ');
    };

	const getResourceDisplayName = (classTree) => {
        if (!classTree) return "Unknown";
        // Attempt to find label in cache.filter_list dictionary if available
        // OR simply Title Case the last part of the tree string
        // Assuming classTree is a string like "mineral_ore_iron"
        if (cache?.filter_list && cache.filter_list[classTree]) {
            return cache.filter_list[classTree];
        }
        // Fallback: return just the classTree
        return classTree;
    };

    const renderIngredients = (slots) => {
        if (!slots) return <tr><td colSpan="2">No ingredients</td></tr>;
        const sortedSlots = Object.entries(slots).sort(([, a], [, b]) => a.slot_type - b.slot_type);

        return sortedSlots.map(([slotName, data]) => {
            let displayString = null;
            let tooltip = null;
            // Use the raw ingredient name; if specific mapping is needed, pass a helper map.
            const ingredientName = data.ingredient; 

            // --- LINKING LOGIC ---
            let linkedSchematic = null;
            if (data.slot_type !== 0 && indexData) {
                linkedSchematic = indexData.find(item => 
                    item.name.toLowerCase() === data.ingredient.toLowerCase()
                );
            }

            const wrapLink = (text) => {
                if (linkedSchematic) {
                    return (
                        <span 
                            className="schematic-ingredient-link" 
                            title={`Open ${linkedSchematic.name} in new tab`}
                            onClick={(e) => {
                                e.stopPropagation(); 
                                onBackgroundOpen(linkedSchematic);
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
                    displayString = <span>{data.quantity} units of {getResourceDisplayName(ingredientName)}</span>;
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
        // Ideally we pass a lookup for nice labels, but raw is safe fallback
        const decodedTitle = getResourceDisplayName(ingredientName); 

        if (!resources || resources.length === 0) {
            return (
                <div key={ingredientName} className="slot-group-empty">
                     <h4 className="slot-header" style={{ 
                    fontSize: '30px', 
                    color: 'var(--accent-blue)', 
                    marginBottom: '10px', 
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border-dim)',
                    paddingBottom: '5px'
                }}>{decodedTitle}</h4>
                     <div className="empty-message">No matching resources found for this configuration.</div>
                </div>
            );
        }

        return (
            <div key={ingredientName} className="slot-group-container" style={{ marginBottom: '30px' }}>
                <h4 className="slot-header" style={{ 
                    fontSize: '30px', 
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
                                    // Pass empty taxonomy if not provided, row handles display
                                    taxonomy={{}} 
                                    onClick={onResourceClick}
                                    onToggleStatus={onToggleStatus || (() => {})} 
                                    onTogglePlanet={onTogglePlanet || (() => {})}
                                    showAge={true}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- Main Render ---

    if (loading) {
        return (
            <div className="modal-loader" style={{position: 'absolute', inset: 0, borderRadius: '4px', zIndex: 20}}>
                <div className="spinner"></div>
                <div className="loader-text">READING BLUEPRINT...</div>
            </div>
        );
    }

    if (!schematic) {
        return (
            <div className="empty-state">
                <i className="fa-solid fa-microchip"></i>
                <h2>No Schematic Selected</h2>
                <p>Select a blueprint from the index to begin analysis.</p>
            </div>
        );
    }

    if (!details) return null;

    return (
        <div className="schematic-content">
            <div className="schematic-header">
                <h2 className="schematic-title">{schematic.name}</h2>
            </div>

            <div className="specs-container">
                <div className="specs-left-column" style={{ display: 'grid', gap: '15px', width: '100%' }}>
                    
                    {/* Specifications */}
                    <div className="info-table-wrapper" style={{width: '40%'}}>
                        <div className="table-header">Specifications</div>
                        <table className="schematic-info-table">
                            <tbody>
                                <tr>
                                    <td className="info-label">Certification Required</td>
                                    <td className="info-value">{details.certification}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Assembly Skill</td>
                                    <td className="info-value">{details.assembly_skill}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Experimentation Skill</td>
                                    <td className="info-value">{details.experimentation_skill}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Customization Skill</td>
                                    <td className="info-value">{details.customization_skill || '-'}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Experience Type</td>
                                    <td className="info-value">{details.experience_type}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Base Experience</td>
                                    <td className="info-value">{details.experience}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Complexity</td>
                                    <td className="info-value">
                                        {details.complexity}
                                        <i className="fa-solid fa-circle-question info-tooltip-icon" title={getComplexityRequirements(details.complexity)}></i>
                                    </td>
                                </tr>
                                {(() => {
                                    const isHigh = details.experimental_categories && details.experimental_categories.length > 0;
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
                    <div className="info-table-wrapper" style={{width: '40%'}}>
                        <div className="table-header">Ingredients</div>
                        <table className="schematic-info-table">
                            <tbody>
                                {renderIngredients(details.slots)}
                            </tbody>
                        </table>
                    </div>
				</div>

				{/* Experimental Categories */}
				<div className="info-table-wrapper" style={{width: '100%'}}>
					<div className="table-header">Experimental Categories</div>
					<div className="exp-cat-list">
						{details.experimental_categories && details.experimental_categories.length > 0 ? (
							details.experimental_categories.map((cat) => (
								<div key={cat.id} className={`exp-cat-item ${cat.selected ? 'selected' : 'dimmed'}`}>
									<div className="exp-cat-header">
										<span className="exp-cat-label">{cat.label}</span>
										<label className="toggle-switch">
											<input type="checkbox" checked={cat.selected} onChange={() => onToggleCategory(cat.id)} />
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

            {/* Resource Ranking Tables Section */}
            <div className="resource-tabs-section" style={{width: '100%', marginTop: '20px'}}>
                <div className="resource-tabs-bar">
                    <button 
                        className={`resource-tab ${activeSubTab === 'best' ? 'active' : ''}`}
                        onClick={() => onSubTabChange('best')}
                    >
                        Best Resources
                    </button>
                    <button 
                        className={`resource-tab ${activeSubTab === 'current' ? 'active' : ''}`}
                        onClick={() => onSubTabChange('current')}
                    >
                        Current Resources
                    </button>
                </div>
                
                <div className="resource-tab-content" style={{ padding: '15px' }}>
                    {hydratedRankings && Object.entries(hydratedRankings)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([ingredientName, data]) => {
                            const resourcesToUse = activeSubTab === 'best' 
                                ? data.best 
                                : data.current;
                            
                            return renderRankingTable(ingredientName, resourcesToUse);
                        })
                    }
                </div>
            </div>
        </div>
    );
};

export default SchematicView;