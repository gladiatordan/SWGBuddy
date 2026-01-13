import React from 'react';
import { getStatColorClass, formatDate } from '../../utils/resourceUtils';

const ALL_PLANETS = ["Corellia", "Dantooine", "Dathomir", "Endor", "Lok", "Naboo", "Rori", "Talus", "Tatooine", "Yavin", "Mustafar", "Kashyyyk"];

const ResourceRow = ({ resource, isEditor, onToggleStatus, onTogglePlanet, onClick }) => {
    // Stat Keys to iterate
    const statKeys = ['res_oq', 'res_cr', 'res_cd', 'res_dr', 'res_fl', 'res_hr', 'res_ma', 'res_pe', 'res_sr', 'res_ut'];

    // Planet Logic
    const currentPlanets = Array.isArray(resource.planet) ? resource.planet : (resource.planet ? [resource.planet] : []);
    const sortedPlanets = [...currentPlanets].sort();

    // Planet Dropdown Options (for Editor)
    const availablePlanets = ALL_PLANETS.filter(p => !currentPlanets.includes(p));

    return (
        <tr onClick={() => onClick(resource)}>
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
                    <td key={key} className={`col-stat ${color}`} title={rating ? `${(rating*100).toFixed(1)}%` : ''}>
                        {val || '-'}
                    </td>
                );
            })}

            {/* Location / Planets */}
            <td className="col-loc">
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
                            onClick={(e) => e.stopPropagation()}
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
            <td className="col-status">
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