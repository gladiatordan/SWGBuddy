import React, { useState, useEffect } from 'react';
import PermissionsTab from './Management/PermissionsTab';
import LogsTab from './Management/LogsTab';

const ManagementModal = ({ isOpen, onClose, serverId }) => {
    const [activeTab, setActiveTab] = useState('permissions');

    if (!isOpen) return null;

    return (
        <div className="modal">
            <div className="modal-content management-modal-content">
                <div className="mgmt-header">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, color: 'var(--accent-blue)', fontFamily: "'Orbitron'" }}>
                            SERVER MANAGEMENT
                        </h2>
                        <span className="mgmt-server-select" style={{ marginLeft: '20px', color: 'var(--text-dim)' }}>
                            {serverId.toUpperCase()}
                        </span>
                    </div>
                    <button className="close-modal" onClick={onClose}>&times;</button>
                </div>
                
                <div className="modal-body mgmt-body">
                    <nav className="mgmt-sidebar">
                        <button 
                            className={`mgmt-nav-btn ${activeTab === 'permissions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('permissions')}
                        >
                            User Permissions
                        </button>
                        <button 
                            className={`mgmt-nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
                            onClick={() => setActiveTab('logs')}
                        >
                            Command Log
                        </button>
                    </nav>
                    
                    <div className="mgmt-view active">
                        {activeTab === 'permissions' ? (
                            <PermissionsTab serverId={serverId} />
                        ) : (
                            <LogsTab serverId={serverId} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManagementModal;