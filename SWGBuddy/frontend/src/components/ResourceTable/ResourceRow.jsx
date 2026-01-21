import React from 'react';
import { getStatColorClass, formatDate, STAT_MAPPING } from '../../utils/resourceUtils';
import { useResources } from '../../hooks/useResources';
import { useServer } from '../../contexts/ServerContext';

const ALL_PLANETS = ["Corellia", "Dantooine", "Dathomir", "Endor", "Lok", "Naboo", "Rori", "Talus", "Tatooine", "Yavin", "Mustafar", "Kashyyyk"];

const ResourceRow = ({ resource, isEditor, onToggleStatus, onTogglePlanet, onClick, taxonomy }) => {
    // Stat Keys to iterate
    const statKeys = Object.keys(STAT_MAPPING);

    // Planet Logic
    const currentPlanets = Array.isArray(resource.planet) ? resource.planet : (resource.planet ? [resource.planet] : []);
    const sortedPlanets = [...currentPlanets].sort();

    const resourceConfig = taxonomy ? taxonomy[resource.class_tree] : null;

    // 3. Logic ported from table.js
    const allowedPlanets = resourceConfig?.planets || ALL_PLANETS;
    const reportedPlanetsLower = (resource.planet || []).map(p => p.toLowerCase());
    
    // Filter available options
    const availablePlanets = allowedPlanets.filter(
        p => !reportedPlanetsLower.includes(p.toLowerCase())
    );

    return (
        <tr>
            <td className="res-name">
                <a className="res-link" onClick={(e) => { e.preventDefault(); onClick(resource); }}>
                    {resource.name}
                </a>
            </td>
            <td className="res-type">{resource.type}</td>
            
            {/* Weight/Rating */}
            <td className={`col-stat ${getStatColorClass(resource.res_weight_rating)}`}>
                {resource.res_weight_rating ? parseInt(resource.res_weight_rating * 1000) : '-'}
            </td>

            {/* Individual Stats */}
            {statKeys.map(key => {
                const val = resource[key];
                const rating = resource[`${key}_rating`];
                const color = getStatColorClass(rating);
                return (
                    <td key={key} className={`col-stat ${color}`} data-tooltip={rating ? `${(rating*100).toFixed(1)}%` : ''}>
                        {val || '-'}
                    </td>
                );
            })}

            {/* Location / Planets */}
            <td className="col-loc" onClick={(e) => e.stopPropagation()}>
                <div className="planets-container">
                    {sortedPlanets.map(p => (
                        <span 
                            key={p} 
                            className={`planet ${p.toLowerCase()}`} 
                            data-tooltip={p}
                            onClick={(e) => {
                                if (!isEditor) return;
                                e.stopPropagation();
                                if(confirm(`Remove ${p} from ${resource.name}?`)) {
                                    onTogglePlanet(resource, p);
                                }
                            }}
                            style={{ cursor: isEditor ? 'pointer' : 'default' }}
                        >
                            {p.charAt(0)}
                        </span>
                    ))}
                </div>
                {isEditor && availablePlanets.length > 0 && (
                    <div className="planet-controls">
                        <select 
                            className="planet-select" 
                            onChange={(e) => onTogglePlanet(resource, e.target.value)}
                            value=""
                        >
                            <option value="" disabled>+</option>
                            {availablePlanets.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                )}
            </td>

            {/* Date */}
            <td className="col-date">{formatDate(resource.date_reported)}</td>

            {/* Status */}
            <td className="col-status" onClick={(e) => e.stopPropagation()}>
                <div className="status-container">
                    <span className={`status-text ${resource.is_active ? 'active' : 'inactive'}`}>
                        {resource.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {isEditor && (
                        <button 
                            className="toggle-status-btn" 
                            data-tooltip="Toggle Status"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleStatus(resource);
                            }}
                        ></button>
                    )}
                </div>
            </td>
        </tr>
    );
};

export default ResourceRow;