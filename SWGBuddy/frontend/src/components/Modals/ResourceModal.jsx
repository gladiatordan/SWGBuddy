import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { useServer } from '../../contexts/ServerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useResources } from '../../hooks/useResources';
import TaxonomySearch from '../Common/TaxonomySearch';
import { getStatColorClass, formatResourceDate, STAT_MAPPING, findTaxonomyNode } from '../../utils/resourceUtils';

const ResourceModal = ({ isOpen, onClose, resource, onSave }) => {
    const { selectedServer } = useServer();
    const { hasPermission } = useAuth();
    const { taxonomy } = useResources(selectedServer);

    // Modes: 'view', 'edit', 'add'
    const [mode, setMode] = useState('view');
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);
    
    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        stats: {},
        notes: '',
        markInactive: false
    });

	const selectedTypeConfig = findTaxonomyNode(taxonomy, formData.type);
	const validStatsForType = selectedTypeConfig?.stats ? Object.keys(selectedTypeConfig.stats) : [];
    
	useEffect(() => {
		if (mode === 'view' || !formData.type) return;

		setFormData(prev => {
			const newStats = { ...prev.stats };
			let hasChanged = false;

			// Iterate through all possible stats
			Object.keys(STAT_MAPPING).forEach(statKey => {
				// If the stat is NOT in the taxonomy for this type, clear it
				if (!validStatsForType.includes(statKey)) {
					if (newStats[statKey] !== null && newStats[statKey] !== undefined) {
						newStats[statKey] = null;
						hasChanged = true;
					}
				}
			});

			return hasChanged ? { ...prev, stats: newStats } : prev;
		});
	}, [formData.type, validStatsForType.length]);

    // Helper: Extract stats from resource object
    const extractStats = (res) => {
		const stats = {};
		['oq','cr','cd','dr','fl','hr','ma','pe','sr','ut'].forEach(key => {
			// Store both the raw value and the rating for view-mode coloring
			stats[`res_${key}`] = res[`res_${key}`];
			stats[`res_${key}_rating`] = res[`res_${key}_rating`];
		});
		return stats;
	};

    // Reset state when opening or switching resources
    useEffect(() => {
        if (isOpen) {
            setStatusMsg(null);
            if (resource) {
                setMode('view');
                setFormData({
                    name: resource.name,
                    type: resource.type,
                    stats: extractStats(resource),
                    notes: resource.notes || '',
                    markInactive: false
                });
            } else {
                setMode('add');
                setFormData({
                    name: '',
                    type: '',
                    stats: {},
                    notes: '',
                    markInactive: false
                });
            }
        }
    }, [isOpen, resource]);

    // --- Actions ---

    const handleStatChange = (key, value) => {
		// 1. If empty, set to null
		if (value === '') {
			setFormData(prev => ({
				...prev,
				stats: { ...prev.stats, [key]: null }
			}));
			return;
		}

		// 2. Enforce Integer only
		const numValue = parseInt(value, 10);
		if (isNaN(numValue)) return;

		// 3. Enforce 1-1000 range
		const clampedValue = Math.max(1, Math.min(1000, numValue));

		setFormData(prev => ({
			...prev,
			stats: {
				...prev.stats,
				[key]: clampedValue
			}
		}));
	};

    const processImageBlob = async (blob) => {
        setLoading(true);
        setStatusMsg({ type: 'info', text: 'Scanning image...' });
        
        try {
            const fd = new FormData();
            fd.append('image', blob);
            
            const result = await API.scanImage(fd);
            
            if (result.success && result.data) {
                setFormData(prev => ({
                    ...prev,
                    // In 'add' mode, we populate name. In 'edit' mode, we keep existing name.
                    name: (mode === 'add' ? result.data.name : prev.name) || prev.name,
                    type: result.data.type || prev.type,
                    stats: { ...prev.stats, ...result.data.stats }
                }));
                setStatusMsg({ type: 'success', text: 'Scan complete!' });
            } else {
                throw new Error(result.error || "OCR Failed");
            }
        } catch (err) {
            console.error("OCR Error:", err);
            setStatusMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // --- NEW: Global Paste Listener (The Fix) ---
    useEffect(() => {
        const handleGlobalPaste = (e) => {
            // Only listen if modal is open and we are editing/adding
            if (!isOpen || mode === 'view') return;

            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
					// setLoading(true);
                    e.preventDefault(); // Stop the image from pasting into a text box
                    const blob = item.getAsFile();
                    processImageBlob(blob);
                    return;
                }
            }
        };

        document.addEventListener('paste', handleGlobalPaste);
        return () => document.removeEventListener('paste', handleGlobalPaste);
    }, [isOpen, mode, processImageBlob]); // Re-bind only if mode changes

    // --- UPDATED: Button Click Handler ---
    const handlePaste = async () => {
        // setLoading(true);
        setStatusMsg({ type: 'info', text: 'Requesting clipboard...' });
        
        try {
            // Attempt standard clipboard read (Subject to browser security)
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find(t => t.startsWith('image/'));
                if (type) {
                    const blob = await item.getType(type);
                    await processImageBlob(blob);
                    return;
                }
            }
            throw new Error("No image found on clipboard.");
        } catch (err) {
            console.warn("Clipboard Button Failed:", err);
            // Fallback instruction if the button is blocked by the browser
            setStatusMsg({ 
                type: 'error', 
                text: "Browser blocked access. Please press Ctrl+V / Cmd+V to paste." 
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        if (mode === 'edit') {
            // Revert changes and go back to view
            setMode('view');
            setFormData({
                name: resource.name,
                type: resource.type,
                stats: extractStats(resource),
                notes: resource.notes || '',
                markInactive: false
            });
            setStatusMsg(null);
        } else {
            // Close if viewing or adding
            onClose();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg(null);

        // Validation
        if (!formData.name || !formData.type) {
            setStatusMsg({ type: 'error', text: "Name and Type are required." });
            setLoading(false);
            return;
        }

        const payload = {
            ...formData.stats,
            name: formData.name,
            type: formData.type,
            notes: formData.notes,
            server_id: selectedServer,
            auto_deactivate: mode === 'add' ? formData.markInactive : undefined
        };

        try {
            if (mode === 'add') {
                await API.addResource(payload, selectedServer);
                onSave(); // Refresh parent
                setMode('view'); 
        		setStatusMsg({ type: 'success', text: 'Resource added successfully!' });
            } else {
                payload.id = resource.id;
                await API.updateResource(payload, selectedServer);
                onSave(); // Refresh parent
                setMode('view'); // Go back to View Mode on success
                setStatusMsg({ type: 'success', text: 'Resource updated successfully' });
            }
        } catch (err) {
            setStatusMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // --- Render Helpers ---

    if (!isOpen) return null;

    const isEditable = mode !== 'view';
    const canEdit = hasPermission('EDITOR'); 

    // Dynamic Title Logic
    let modalTitle = "Resource Details";
    if (mode === 'add') modalTitle = "Add Resource";
    else if (mode === 'view') modalTitle = `Resource Details - ${formData.name}`;
    else if (mode === 'edit') modalTitle = `Edit Details - ${formData.name}`;

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{modalTitle}</h2>
                    <button className="close-modal" onClick={onClose}>&times;</button>
                </div>

                {loading && (
                    <div className="modal-loader">
                        <div className="spinner"></div>
                        <div className="loader-text">PROCESSING...</div>
                    </div>
                )}

                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        
                        {/* Name Field - Only visible in ADD mode */}
                        {mode === 'add' && (
                            <div className="form-group">
                                <label>Resource Name</label>
                                <input 
                                    type="text" 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    required 
                                    placeholder="e.g. Polonium" 
                                    autoComplete="off"
                                />
                            </div>
                        )}
                        
                        {/* Type Field - Visible in ALL modes (First field in Edit/View) */}
                        <div className="form-group">
                            <label>Type</label>
                            <TaxonomySearch 
                                taxonomy={taxonomy} 
                                value={formData.type} 
                                onChange={val => setFormData({...formData, type: val})}
								onlyValid={true}
                                disabled={!isEditable}
                            />
                        </div>

                        {/* Stats Grid */}
                        <div className="stats-label">Stats</div>
                        <div className={isEditable ? "stats-grid" : "stats-grid-view"}>
                            {Object.entries(STAT_MAPPING).map(([valKey, label]) => {
								const ratKey = `${valKey}_rating`;
								const value = formData.stats[valKey] || '';
								const rating = formData.stats[ratKey];

								// Check if this specific stat is allowed for the chosen resource type
								const isDisabled = !validStatsForType.includes(valKey);

								if (!isEditable) {
									// View Mode: Hide stats that are empty or N/A for this type
									if (!value || value === '-' || isDisabled) return null;
									
									const tooltip = rating !== null ? `Rating: ${(rating * 100).toFixed(1)}%` : '';
									
									return (
										<div key={valKey} className="stat-box" title={tooltip}>
											<label>{label}</label>
											<span className={`stat-value ${getStatColorClass(rating)}`}>{value}</span>
										</div>
									);
								}

                                // Edit/Add Mode: Inputs
                                return (
									<div key={valKey} className={`stat-group ${isDisabled ? 'disabled-stat' : ''}`}>
										<label>{label}</label>
										<div className="stat-input-wrapper">
											<input 
												type="number" 
												className="stat-input-no-spinner"
												value={isDisabled ? '' : value}
												onChange={e => handleStatChange(valKey, e.target.value)}
												disabled={isDisabled}
												placeholder={isDisabled ? 'N/A' : '0'}
												min="1" 
												max="1000"
											/>
											{/* Show "X" only if field is enabled and has a value */}
											{!isDisabled && value !== '' && (
												<button 
													type="button" 
													className="clear-stat-btn"
													onClick={() => handleStatChange(valKey, '')}
													title={`Clear ${label}`}
												>
													&times;
												</button>
											)}
										</div>
									</div>
								);
                            })}
                        </div>

                        {/* Meta Info (View Only) */}
                        {mode !== 'add' && resource && (
                            <div className="meta-grid">
                                <div className="form-group">
									<label>Last Updated</label>
									<div className="static-value">
										{formatResourceDate(resource.last_updated || resource.date_reported)}
									</div>
								</div>
                                <div className="form-group">
                                    <label>Reporter</label>
                                    <div className="static-value">{resource.reporter_name || '-'}</div>
                                </div>
                                <div className="form-group">
                                    <label>Planets</label>
                                    <div className="static-value">
                                        {Array.isArray(resource.planet) ? resource.planet.join(', ') : resource.planet}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="form-group full-width" style={{marginTop: '15px'}}>
                            <label>Notes</label>
                            <textarea 
                                className="modal-textarea" 
                                value={formData.notes}
                                onChange={e => setFormData({...formData, notes: e.target.value})}
                                disabled={!isEditable}
                                placeholder={isEditable ? "Enter notes here..." : "No notes available."}
                            ></textarea>
                        </div>

                        {/* Auto-Deactivate Checkbox (Only for ADD mode) */}
                        {mode === 'add' && (
							<div className="form-group full-width" style={{
								flexDirection: 'row', 
								alignItems: 'center', 
								gap: '10px', 
								marginBottom: '10px',
								opacity: validStatsForType.length > 0 && selectedTypeConfig?.planets?.length === 1 ? 1 : 0.5 // Visual feedback
							}}>
								<input 
									type="checkbox" 
									id="mark-inactive" 
									checked={formData.markInactive}
									onChange={e => setFormData({...formData, markInactive: e.target.checked})}
									/* Logic: Enable only if there is exactly 1 planet in taxonomy for this type */
									disabled={selectedTypeConfig?.planets?.length !== 1}
									style={{
										width: 'auto', 
										margin: 0, 
										cursor: (selectedTypeConfig?.planets?.length === 1) ? 'pointer' : 'not-allowed'
									}}
								/>
								<label htmlFor="mark-inactive" style={{margin: 0, cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem'}}>
									Mark Identical Types Inactive
								</label>
							</div>
						)}

                        {/* Import Section (Only in Edit/Add mode) */}
                        {isEditable && (
                            <div className="form-group full-width" style={{marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px'}}>
                                <button type="button" className="btn-secondary" onClick={handlePaste} style={{width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}}>
                                    <i className="fa-solid fa-clipboard"></i> Paste Image from Clipboard
                                </button>
                            </div>
                        )}

                        {/* Status Bar */}
                        {statusMsg && (
                            <div className={`status-bar status-${statusMsg.type}`}>
                                {statusMsg.text}
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="modal-footer">
                            {mode === 'view' ? (
                                canEdit ? (
                                    <button type="button" className="btn-secondary" onClick={() => setMode('edit')}>
                                        Edit Details
                                    </button>
                                ) : <div></div>
                            ) : (
                                <div className="footer-actions">
                                    <button type="submit" className="btn-primary" disabled={loading}>Save</button>
                                    <button type="button" className="btn-danger" onClick={handleCancel}>Cancel</button>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ResourceModal;