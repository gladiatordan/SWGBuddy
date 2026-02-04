import React, { useState, useMemo } from 'react';
import { useServer } from '../../contexts/ServerContext';
import { useResources } from '../../hooks/useResources';
import TaxonomySearch from '../Common/TaxonomySearch';
import { STAT_MAPPING } from '../../utils/resourceUtils';

// --- Hardcoded Options ---
const CATEGORY_OPTIONS = [
	"None",
	"Creatures",
	"Armor",
	"Chemical",
	"Clothing",
	"Droid",
	"Food",
	"Furniture",
	"Generic Item",
	"Genetics",
	"Installation",
	"Lightsaber",
	"Droid Engineer",
	"Tailor",
	"Misc",
	"Mission",
	"Tissues",
	"Ship Tools",
	"Starship Components",
	"Vehicle",
	"Weapon"
]

const PROFESSION_OPTIONS = [
	"None", "Armorsmith", "Artisan", "Bio-Engineer", "Chef", "Dancer", "Droid Engineer", "Entertainer", "Medic", "Musician", "Ranger", "Smuggler",
	"Tailor", "Weaponsmith", "Architect", "Shipwright"
];

const CERTIFICATION_OPTIONS = [
    "None", "Novice Entertainer", "Master Entertainer", "Entertainer Item Use I", "Entertainer Item Use II", "Entertainer Item Use III", "Entertainer Item Use IV",
    "Novice Scout", "Trapping I: Makeshift Design", "Trapping II: Refined Design", "Trapping III: Martial Design", "Trapping IV: Elite Martial Design",
    "Survival II: Advanced Techniques", "Survival IV: Special Techniques", "Novice Medic", "Organic Chemistry I: Suspensions", "Organic Chemistry II: Dispersal Mechanisms",
    "Organic Chemistry III: Stimpack B", "Organic Chemistry IV: Compounds", "Novice Artisan", "Master Artisan", "Engineering I: Tinkering", "Engineering II: Hardware Design",
    "Engineering III: Advanced Concepts", "Engineering IV: Complex Systems", "Domestic Arts I: Simple Cooking", "Domestic Arts II: Simple Tailoring", "Domestic Arts III: Basic Desserts",
    "Domestic Arts IV: Clothing Repair", "Novice Dancer", "Master Dancer", "Dancing Prop Use I", "Dancing Prop Use II", "Dancing Prop Use III", "Dancing Prop Use IV",
    "Novice Musician", "Master Musician", "Instrument Use I", "Instrument Use II", "Instrument Use III", "Instrument Use IV", "Novice Ranger", "Master Ranger",
    "Wayfaring I: Basic Concealment", "Wayfaring II: Rough Terrain Mastery", "Wayfaring III: Stealth Techniques", "Wayfaring IV: Exploration Mastery",
    "Frontiering II: Advanced Camp Engineering", "Frontiering IV: Habitat Engineering", "Advanced Trapping II: Imaginative Design", "Advanced Trapping III: Ingenious Design",
    "Novice Bio-Engineer", "Master Bio-Engineer", "Clone Engineering I", "Clone Engineering II", "Clone Engineering III", "Clone Engineering IV", "Tissue Engineering I",
    "Tissue Engineering II", "Tissue Engineering III", "Tissue Engineering IV", "Engineering Techniques I", "Engineering Techniques II", "Engineering Techniques III",
    "Engineering Techniques IV", "Novice Armorsmith", "Master Armorsmith", "Personal Armor Appearance I: Basic Appearance", "Personal Armor Appearance II: Advanced Appearance",
    "Personal Armor Appearance III: Expert Appearance", "Personal Armor Appearance IV: Artistic Appearance", "Layers I: Basic Enhancements", "Layers II: Intermediate Enhancements",
    "Layers III: Advanced Protection", "Layers IV: Exotic Protection", "Deflectors I: Deflector Components", "Deflectors II: Mk 1 Technology", "Deflectors III: Mk 2 Technology",
    "Deflectors IV: Mk 3 Technology", "Technique I: Protection Fundamentals", "Technique II: Advanced Outfitting", "Technique III: Expert Outfitting", "Technique IV: Armor Manufacturer",
    "Novice Weaponsmith", "Master Weaponsmith", "Intermediate Melee Weapons Crafting", "Advanced Melee Weapons Crafting", "Expert Melee Weapons Crafting", "Master Melee Weapons Crafting",
    "Intermediate Firearms Crafting", "Advanced Firearms Crafting", "Expert Firearms Crafting", "Master Firearms Crafting", "Intermediate Munitions Crafting", "Advanced Munitions Crafting",
    "Expert Munitions Crafting", "Master Munitions Crafting", "Novice Chef", "Master Chef", "Entrees I: Basic Meals", "Entrees II: Advanced Cooking", "Entrees III: Complex Dishes",
    "Entrees IV: Creative Dishes", "Desserts I: Pastries", "Desserts II: Cakes", "Desserts III: Complex Desserts", "Desserts IV: Delicious Creations", "Mixology I: Cantina Favorites",
    "Mixology II: Fruity Drinks", "Mixology III: Hard Drinks", "Mixology IV: Regional Favorites", "Novice Tailor", "Master Tailor", "Casual Wear I: Basics", "Casual Wear II: Synthetics",
    "Casual Wear III: Weather Wear", "Casual Wear IV: Complex Clothing", "Field Wear I: Basic Gear", "Field Wear II: Reinforced Fibers", "Field Wear III: Martial Gear",
    "Field Wear IV: Paramilitary Gear", "Formal Wear I: Fashion Basics", "Formal Wear II: Jewelry", "Formal Wear III: Gowns", "Formal Wear IV: High Fashion",
    "Novice Architect", "Master Architect", "Furniture I: Modest", "Furniture II: Stylish", "Furniture III: Advanced", "Furniture IV: Tech", "Construction I: Intermediate",
    "Construction II: Advanced", "Construction III: Expert", "Construction IV: Technician", "Installations I: Factories", "Installations II: Medium Harvesters",
    "Installations III: Medium Harvesters", "Installations IV: Heavy Harvesters", "Buildings I: Small Houses", "Buildings II: Medium Houses", "Buildings III: Large Houses",
    "Buildings IV: Large Houses", "Novice Droid Engineer", "Master Droid Engineer", "Intermediate Droid Production", "Advanced Droid Production", "Expert Droid Production",
    "Master Droid Production", "Intermediate Droid Construction Techniques", "Advanced Droid Construction Techniques", "Expert Droid Construction Techniques",
    "Master Droid Construction Techniques", "Intermediate Droid Refinement", "Advanced Droid Refinement", "Expert Droid Refinement", "Master Droid Refinement",
    "Intermediate Droid Blueprints", "Advanced Droid Blueprints", "Expert Droid Blueprints", "Master Droid Blueprints", "Novice Smuggler", "Delinquency I: Spice",
    "Delinquency II: Medicinal", "Delinquency III: Recreational", "Delinquency IV: Banned", "Jedi Initiate", "Lightsaber I: Laser Weapon Basics", "Lightsaber II: Celerity",
    "Lightsaber III: Precision", "Lightsaber IV: Advanced Strikes", "Jedi Apprentice", "Two-hand Lightsaber I: Precision", "Two-hand Lightsaber II: Stability",
    "Two-hand Lightsaber III: Skilled Strikes", "Two-hand Lightsaber IV: Wild Swing", "Jedi Guardian", "Polearm Saber I: Precision", "Polearm Saber II: Expert Strikes",
    "Polearm Saber III: Improved Precision", "Polearm Saber IV: Power Strikes", "Dark Jedi Apprentice", "Heavy Lightsaber I: Called Strikes", "Heavy Lightsaber II: Stances",
    "Heavy Lightsaber III: Sturdy Strikes", "Heavy Lightsaber IV: Vigorous Attack", "Dark Jedi Guardian", "Dual-edge Saber I: Called Strikes", "Dual-edge Saber II: Mighty Strikes",
    "Dual-edge Saber III: Accurate Strikes", "Dual-edge Saber IV: Devastating Moves", "Novice Shipwright", "Master Shipwright", "Spaceframe Engineering I: Small Chassis",
    "Spaceframe Engineering II: Standard Assault Ships", "Spaceframe Engineering III: Heavy Fighters", "Spaceframe Engineering IV: Advanced Ship Design",
    "Propulsion Technology I: Simple Ion Drives", "Propulsion Technology II: Thrust Dynamics", "Propulsion Technology III: Advanced Hyperdrive Engineering",
    "Propulsion Technology IV: Advanced Drive Theory", "Core Systems I: Basic Systems", "Core Systems II: Intermediate Ship Devices", "Core Systems III: Heavy Internal Systems",
    "Core Systems IV: Advanced Assembly", "Defense Systems I: Light Armaments", "Defense Systems II: Standard Ordnance", "Defense Systems III: Heavy Weapons",
    "Defense Systems IV: Advanced Ship Defense"
];

const ASSEMBLY_OPTIONS = [
    "None", "Advanced Assembly", "Armor Assembly", "Bio-Engineer Assembly", "Booster Assembly", "Chassis Assembly", "Clothing Assembly", "Combat Medicine Assembly",
    "Creature Assembly", "Domestic Arts Assembly", "Droid Assembly", "Engine Assembly", "Engineering Assembly", "Firearm Assembly", "Food Assembly", "Force Assembly",
    "Artisan Assembly", "Grenade Assembly", "Instrument Assembly", "Lightsaber Assembly", "Medical Assembly", "Melee Weapon Assembly", "Munition Assembly",
    "Dance Prop Assembly", "Shields Assembly", "Spice Assembly", "Structure Assembly", "Tissue Assembly", "Weapon Assembly"
];

const EXPERIMENT_SKILL_OPTIONS = [
    "None", "Advanced Component Experimentation", "Armor Experimentation", "Medic Experimentation", "Bio-Engineer Experimentation", "Booster Experimentation",
    "Chassis Experimentation", "Clothing Experimentation", "Combat Medicine Experimentation", "Creature Experimentation", "Droid Experimentation", "Engine Experimentation",
    "Firearm Experimentation", "Food Experimentation", "Force Experimentation", "Artisan Experimentation", "Grenade Experimentation", "Lightsaber Experimentation",
    "Medical Experimentation", "Melee Experimentation", "Munition Experimentation", "Power Systems Experimentation", "Shield Experimentation", "Spice Experimentation",
    "Structure Experimentation", "Tissue Experimentation", "Weapon Experimentation", "Weapon Systems Experimentation"
];

const CUSTOMIZATION_OPTIONS = [
    "None", "Armor Customization", "Artisan Clothing Customization", "Clothing Customization", "Droid Customization"
];

const XP_TYPE_OPTIONS = [
    "None", "Bio-Engineer Crafting", "Tissue Engineering", "Armor Crafting", "Tailoring", "Droid Crafting", "Food Crafting", "General Crafting", "Medicine Crafting",
    "Scout", "Spice Crafting", "Structure Crafting", "Weapon Crafting", "Melee Weapon Crafting", "Munitions Crafting", "Ranged Weapon Crafting", "Force-sensitive Crafting"
];

const EXP_CATEGORY_OPTIONS = [
    "Experimental Acceleration", "Ammunition Quantity", "Experimental Armor Hitpoints", "Experimental Armor Effectiveness", "Experimental Booster Acceleration",
    "Experimental Booster Energy Consumption", "Experimental Booster Energy", "Experimental Booster Recharge Rate", "Experimental Booster Speed", "Experimental Capacitor Energy",
    "Experimental Charges", "Experimental Count", "Experimental Damage Max", "Experimental Damage Minimum", "Experimental Deceleration", "Experimental Droid Command Speed",
    "Experimental Droid Speed", "Experimental Durability", "Experimental Shield Effectiveness", "Experimental Effectiveness", "Experimental Energy Generation Rate",
    "Experimental Energy Maintenance", "Experimental Energy Per Shot", "Experimental Engine Deceleration", "Experimental Speed", "Experimental Filling",
    "Experimental Flavor", "Experimental Firing Rate", "Experimental Hitpoints", "Experimental Maximum Hitpoints", "Experimental Maintenance", "Experimental Mass",
    "Maximum Hold Capacity", "Chaff Maximum Effectiveness", "Chaff Minimum Effectiveness", "Experimental Nutritional Value", "Experimental Pitch", "Experimental Quality",
    "Experimental Quantity", "Experimental Recharge Rate", "Experimental Resistance", "Experimental Roll", "Experimental Back Hitpoints", "Experimental Front Hitpoints",
    "Experimental Shield Recharge Rate", "Experimental Yaw", "Experimental Absorption", "Weight & Accuracy", "Experimental Aggression Profile", "Glop Chemical Potency",
    "Detonator Craftsmanship", "Customized Fuse System", "Experimental Damage", "Experimental Duration", "Experimental Ease of Use", "Experimental Efficiency",
    "Experimental Elemental Damage", "Enhanced Core Volatility", "Cryo Core Experimentation", "Experimental Intelligence", "Experimental Mental Profile",
    "Experimental Physique Profile", "Proton Module", "Experimental Prowess Profile", "Experimental Psychological Profile", "Experimental Range", "Experimental Storage",
    "Thermal Core", "Experimental Primary Agent", "Experimental Secondary Agent", "Experimental Residual", "Condition"
];

const STAT_OPTIONS = Object.values(STAT_MAPPING);

const SLOT_TYPE_TOOLTIP = 
    "0 - Resource (Select from Taxonomy)\n" +
    "1 - Identical (Same Resource Type)\n" +
    "2 - Similar (Same Resource Class)\n" +
    "3 - Optional Identical\n" +
    "4 - Optional Similar";

const AddSchematicModal = ({ isOpen, onClose, onSave }) => {
    const { selectedServer } = useServer();
    const { cache } = useResources(selectedServer);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
		category: '',
		profession: '',
        certification: '',
        assemblySkill: '',
        experimentSkill: '',
        customizationSkill: '',
        xpType: '',
        baseXp: '',
        complexity: '',
        slots: [], // { name, type, ingredient, quantity }
        experimentWeights: [] // { category, weights: [{stat, value}] }
    });

    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);

    // --- Helpers ---
    
    const toTitleCase = (str) => {
        return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const handleNameChange = (val) => {
        // Just enforce title case on what is typed? Or allow typing and format on blur?
        // Prompt says "ensure every word is capitalized". Real-time formatting can be annoying if it messes with cursor.
        // We will capitalize the first letter of every word as they type.
        const formatted = val.replace(/\b\w/g, c => c.toUpperCase());
        setFormData(prev => ({ ...prev, name: formatted }));
    };

    const handleIntInput = (field, val, max) => {
        if (val === '') {
            setFormData(prev => ({ ...prev, [field]: '' }));
            return;
        }
        let intVal = parseInt(val, 10);
        if (!isNaN(intVal)) {
            intVal = Math.max(0, Math.min(max, intVal));
            setFormData(prev => ({ ...prev, [field]: intVal }));
        }
    };

    // --- Slot Handlers ---

    const addSlot = () => {
        setFormData(prev => ({
            ...prev,
            slots: [...prev.slots, { name: '', type: 0, ingredient: '', quantity: 1 }]
        }));
    };

    const removeSlot = (idx) => {
        setFormData(prev => ({
            ...prev,
            slots: prev.slots.filter((_, i) => i !== idx)
        }));
    };

    const handleSlotChange = (idx, field, val) => {
        const newSlots = [...formData.slots];
        
        if (field === 'name') {
            // [a-z][A-Z] only, Title Case
            const sanitized = val.replace(/[^a-zA-Z\s-]/g, '');
            newSlots[idx][field] = sanitized.replace(/\b\w/g, c => c.toUpperCase());
        } else if (field === 'type') {
            let intVal = parseInt(val, 10);
            if (isNaN(intVal)) intVal = 0;
            newSlots[idx][field] = Math.max(0, Math.min(4, intVal));
            // Reset ingredient if type changes between resource (0) and others
            newSlots[idx].ingredient = '';
        } else if (field === 'quantity') {
            if (val === '') newSlots[idx][field] = '';
            else {
                let intVal = parseInt(val, 10);
                if (!isNaN(intVal)) {
                    newSlots[idx][field] = Math.max(1, Math.min(500000, intVal));
                }
            }
        } else if (field === 'ingredient') {
             // If type > 0, sanitize text input [a-zA-Z|]
            if (newSlots[idx].type > 0) {
                //  const sanitized = val.replace(/[^a-zA-Z|]/g, '');
                 // Split by |, title case each part
                 const titleCased = val.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                 newSlots[idx][field] = titleCased;
            } else {
                newSlots[idx][field] = val; // Taxonomy value
            }
        }

        setFormData(prev => ({ ...prev, slots: newSlots }));
    };

    // --- Experiment Weight Handlers ---

    const addExpCategory = () => {
        setFormData(prev => ({
            ...prev,
            experimentWeights: [...prev.experimentWeights, { category: '', weights: [] }]
        }));
    };

    const removeExpCategory = (idx) => {
        setFormData(prev => ({
            ...prev,
            experimentWeights: prev.experimentWeights.filter((_, i) => i !== idx)
        }));
    };

    const updateExpCategoryName = (idx, val) => {
        const newExp = [...formData.experimentWeights];
        newExp[idx].category = val;
        setFormData(prev => ({ ...prev, experimentWeights: newExp }));
    };

    const addStatWeight = (catIdx) => {
        const newExp = [...formData.experimentWeights];
        newExp[catIdx].weights.push({ stat: '', value: 0 });
        setFormData(prev => ({ ...prev, experimentWeights: newExp }));
    };

    const removeStatWeight = (catIdx, weightIdx) => {
        const newExp = [...formData.experimentWeights];
        newExp[catIdx].weights = newExp[catIdx].weights.filter((_, i) => i !== weightIdx);
        setFormData(prev => ({ ...prev, experimentWeights: newExp }));
    };

    const updateStatWeight = (catIdx, weightIdx, field, val) => {
        const newExp = [...formData.experimentWeights];
        if (field === 'value') {
            if (val === '') {
                newExp[catIdx].weights[weightIdx][field] = '';
            } else {
				// Allow valid starting chars for decimals
				if (val === '.' || val === '0.') {
					newExp[catIdx].weights[weightIdx][field] = val;
				} else {
					let floatVal = parseFloat(val);
					if (!isNaN(floatVal)) {
						// Clamp 0-100 (Changed from 0-1)
						if (floatVal > 100) floatVal = 100;
						if (floatVal < 0) floatVal = 0;

						// If input is within bounds, use raw string to preserve precision
						if (parseFloat(val) >= 0 && parseFloat(val) <= 100) {
							newExp[catIdx].weights[weightIdx][field] = val;
						} else {
							newExp[catIdx].weights[weightIdx][field] = floatVal.toString();
						}
					}
				}
            }
        } else {
            newExp[catIdx].weights[weightIdx][field] = val;
        }
        setFormData(prev => ({ ...prev, experimentWeights: newExp }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg(null);

        if (!formData.name) {
             setStatusMsg({ type: 'error', text: "Schematic Name is required." });
             setLoading(false);
             return;
        }

        // Validate Category
        if (!formData.category || formData.category === 'None') {
             setStatusMsg({ type: 'error', text: "Category is required." });
             setLoading(false);
             return;
        }

        // 1. Clean up Slot Ingredients (Trim spaces around pipes)
        const cleanedSlots = formData.slots.map(slot => {
            let ing = slot.ingredient;
            if (slot.type > 0 && ing) {
                // Split by |, trim each part, remove empty parts, join by |
                ing = ing.split('|').map(s => s.trim()).filter(s => s).join('|');
            }
            return { ...slot, ingredient: ing };
        });

        // 2. Ensure weights are floats
        const finalExpWeights = formData.experimentWeights.map(cat => ({
            ...cat,
            weights: cat.weights.map(w => {
                // Find key where STAT_MAPPING[key] == w.stat
                const statKey = Object.keys(STAT_MAPPING).find(key => STAT_MAPPING[key] === w.stat) || w.stat;
                
                return { 
                    stat: statKey, 
                    value: (parseFloat(w.value) || 0) / 100 
                };
            })
        }));

        const payload = { ...formData, slots: cleanedSlots, experimentWeights: finalExpWeights };
        console.log("Saving Schematic:", payload);
        
        try {
             await onSave(payload);
             setStatusMsg({ type: 'success', text: 'Schematic saved!' });
             setTimeout(onClose, 1000);
        } catch(err) {
            setStatusMsg({ type: 'error', text: err.message || 'Error saving.' });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal">
            <div className="modal-content" style={{ width: '700px' }}>
                <div className="modal-header">
                    <h2>Add Schematic</h2>
                    <button className="close-modal" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        
                        {/* --- Metadata Section --- */}
                        <div className="form-group">
                            <label>Schematic Name</label>
                            <div className="stat-input-wrapper">
                                <input 
                                    type="text" 
                                    value={formData.name}
                                    onChange={e => handleNameChange(e.target.value)}
                                    placeholder="Schematic Name..."
                                    required
                                />
                                {formData.name && (
                                    <button type="button" className="clear-stat-btn" onClick={() => setFormData({...formData, name: ''})}>&times;</button>
                                )}
                            </div>
                        </div>

						<div className="form-group">
							<label>Category</label>
							<TaxonomySearch 
								options={CATEGORY_OPTIONS}
								value={formData.category}
								onChange={val => setFormData({...formData, category: val})}
								placeholder="Select Category..."
							/>
						</div>

						<div className="form-group">
							<label>Profession</label>
							<TaxonomySearch
								options={PROFESSION_OPTIONS}
								value={formData.profession}
								onChange={val => setFormData({...formData, profession: val})}
								placeholder="Select Profession..."
							/>
						</div>

                        <div className="form-group">
                            <label>Certification Required</label>
                            <TaxonomySearch 
                                options={CERTIFICATION_OPTIONS}
                                value={formData.certification}
                                onChange={val => setFormData({...formData, certification: val})}
                                placeholder="Select Certification..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Assembly Skill</label>
                            <TaxonomySearch 
                                options={ASSEMBLY_OPTIONS}
                                value={formData.assemblySkill}
                                onChange={val => setFormData({...formData, assemblySkill: val})}
                                placeholder="Select Skill..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Experimentation Skill</label>
                            <TaxonomySearch 
                                options={EXPERIMENT_SKILL_OPTIONS}
                                value={formData.experimentSkill}
                                onChange={val => setFormData({...formData, experimentSkill: val})}
                                placeholder="Select Skill..."
                            />
                        </div>

                         <div className="form-group">
                            <label>Customization Skill</label>
                            <TaxonomySearch 
                                options={CUSTOMIZATION_OPTIONS}
                                value={formData.customizationSkill}
                                onChange={val => setFormData({...formData, customizationSkill: val})}
                                placeholder="Select Skill..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Experience Type</label>
                            <TaxonomySearch 
                                options={XP_TYPE_OPTIONS}
                                value={formData.xpType}
                                onChange={val => setFormData({...formData, xpType: val})}
                                placeholder="Select XP Type..."
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div className="form-group">
                                <label>Base Experience</label>
                                <div className="stat-input-wrapper">
                                    <input 
                                        type="number" 
                                        className="stat-input-no-spinner"
                                        value={formData.baseXp}
                                        onChange={e => handleIntInput('baseXp', e.target.value, 10000)}
                                        placeholder="0 - 10000"
                                        min="0" max="10000"
                                    />
                                    {formData.baseXp !== '' && (
                                        <button type="button" className="clear-stat-btn" onClick={() => setFormData({...formData, baseXp: ''})}>&times;</button>
                                    )}
                                </div>
                            </div>
                             <div className="form-group">
                                <label>Complexity</label>
                                <div className="stat-input-wrapper">
                                    <input 
                                        type="number" 
                                        className="stat-input-no-spinner"
                                        value={formData.complexity}
                                        onChange={e => handleIntInput('complexity', e.target.value, 200)}
                                        placeholder="0 - 200"
                                        min="0" max="200"
                                    />
                                    {formData.complexity !== '' && (
                                        <button type="button" className="clear-stat-btn" onClick={() => setFormData({...formData, complexity: ''})}>&times;</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* --- Slots Section --- */}
                        <div className="form-group full-width" style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                            <label>Manufacturing Slots</label>
                            <div className="waypoints-edit-container">
                                {formData.slots.map((slot, idx) => (
                                    <div key={idx} className="waypoint-row-edit" style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr 1.5fr 0.8fr auto', gap: '5px' }}>
                                        {/* Name */}
                                        <div className="wp-input-group large">
                                             <input 
                                                type="text" 
                                                value={slot.name}
                                                onChange={e => handleSlotChange(idx, 'name', e.target.value)}
                                                placeholder="Slot Name"
                                            />
                                        </div>
                                        {/* Type */}
                                        <div className="wp-input-group small" title={SLOT_TYPE_TOOLTIP} style={{ cursor: 'help' }}>
                                             <span className="wp-prefix">Type</span>
                                             <input 
                                                type="number" 
												className="stat-input-no-spinner"
                                                value={slot.type}
                                                onChange={e => handleSlotChange(idx, 'type', e.target.value)}
                                                min="0" max="4"
                                            />
                                        </div>
                                        {/* Ingredient */}
                                        {slot.type === 0 ? (
                                             <div style={{ flex: 1, minWidth: 0 }}>
                                                <TaxonomySearch 
                                                    options={cache?.filter_list || {}} 
                                                    value={slot.ingredient}
                                                    onChange={val => handleSlotChange(idx, 'ingredient', val)}
                                                    placeholder="Resource Type"
                                                    onlyValid={true}
                                                />
                                             </div>
                                        ) : (
                                            <div className="wp-input-group large">
                                                <input 
                                                    type="text" 
                                                    value={slot.ingredient}
                                                    onChange={e => handleSlotChange(idx, 'ingredient', e.target.value)}
                                                    placeholder="Ingredient (e.g. Iron|Steel)"
                                                />
                                            </div>
                                        )}
                                        {/* Quantity */}
                                        <div className="wp-input-group small">
                                             <span className="wp-prefix">Qty</span>
                                             <input 
                                                type="number" 
												className="stat-input-no-spinner"
                                                value={slot.quantity}
                                                onChange={e => handleSlotChange(idx, 'quantity', e.target.value)}
                                                placeholder="Qty"
                                            />
                                        </div>
                                        {/* Delete */}
                                        <button type="button" className="waypoint-delete-btn" onClick={() => removeSlot(idx)}>
                                            <i className="fa-solid fa-trash"></i>
                                        </button>
                                    </div>
                                ))}

                                <button type="button" className="add-waypoint-btn" onClick={addSlot}>
                                    <i className="fa-solid fa-plus"></i> Add Slot
                                </button>
                            </div>
                        </div>

                         {/* --- Experiment Weights Section --- */}
                         <div className="form-group full-width" style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                            <label>Experimentation Weights</label>
                            <div className="waypoints-edit-container">
                                {formData.experimentWeights.map((cat, catIdx) => (
                                    <div key={catIdx} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                            <div style={{ flex: 1 }}>
                                                <TaxonomySearch 
                                                    options={EXP_CATEGORY_OPTIONS}
                                                    value={cat.category}
                                                    onChange={val => updateExpCategoryName(catIdx, val)}
                                                    placeholder="Select Experiment Category..."
                                                />
                                            </div>
                                            <button type="button" className="btn-danger" style={{ padding: '2px 10px' }} onClick={() => removeExpCategory(catIdx)}>
                                                Remove Group
                                            </button>
                                        </div>

                                        {/* Weights List */}
                                        {cat.weights.map((w, wIdx) => (
                                             <div key={wIdx} className="waypoint-row-edit" style={{ marginLeft: '20px', marginBottom: '5px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <TaxonomySearch 
                                                        options={STAT_OPTIONS}
                                                        value={w.stat}
                                                        onChange={val => updateStatWeight(catIdx, wIdx, 'stat', val)}
                                                        placeholder="Stat (e.g. OQ)"
                                                    />
                                                </div>
                                                <div className="wp-input-group small" style={{ width: '100px' }}>
                                                    <span className="wp-prefix">%</span>
                                                    <input 
                                                        type="number" 
                                                        value={w.value}
														className="stat-input-no-spinner"
                                                        onChange={e => updateStatWeight(catIdx, wIdx, 'value', e.target.value)}
                                                        step="1" min="1" max="100"
                                                    />
                                                </div>
                                                <button type="button" className="waypoint-delete-btn" onClick={() => removeStatWeight(catIdx, wIdx)}>
                                                    &times;
                                                </button>
                                             </div>
                                        ))}
                                        <button type="button" className="add-waypoint-btn" style={{ marginLeft: '20px', fontSize: '0.8rem' }} onClick={() => addStatWeight(catIdx)}>
                                            + Add Weight
                                        </button>
                                    </div>
                                ))}

                                <button type="button" className="add-waypoint-btn" onClick={addExpCategory}>
                                    <i className="fa-solid fa-plus"></i> Add Experiment Category
                                </button>
                            </div>
                        </div>

                         {/* Status Bar */}
                        {statusMsg && (
                            <div className={`status-bar status-${statusMsg.type}`} style={{ marginTop: '15px' }}>
                                {statusMsg.text}
                            </div>
                        )}

                        <div className="modal-footer">
                            <div className="footer-actions">
                                <button type="submit" className="btn-primary" disabled={loading}>Save Schematic</button>
                                <button type="button" className="btn-danger" onClick={onClose}>Cancel</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AddSchematicModal;