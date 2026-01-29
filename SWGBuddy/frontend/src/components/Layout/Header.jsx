import React, { useState } from 'react';
import AuthWidget from '../Auth/AuthWidget';
import { useServer } from '../../contexts/ServerContext';
import ManagementModal from '../Modals/ManagementModal';

// Now accepts props for state control
const Header = ({ activeTab, setActiveTab, selectedServer, setSelectedServer }) => {
    const [isMgmtOpen, setIsMgmtOpen] = useState(false);
    return (
        <header className="main-header">
            <div className="logo"><span>SWG</span>BUDDY</div>
            
            <nav className="top-nav">
                <button 
                    className={`nav-btn ${activeTab === 'resources' ? 'active' : ''}`}
                    onClick={() => setActiveTab('resources')}
                >
                    RESOURCES
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'schematics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('schematics')}
                >
                    SCHEMATICS
                </button>
            </nav>

            <div className="controls-section">
                <div className="server-select-container">
                    <label htmlFor="server-select-wrapper"><i className="fa-solid fa-server"></i></label>
                    <select 
                        id="server-select-wrapper" 
                        value={selectedServer}
                        onChange={(e) => setSelectedServer(e.target.value)}
                        className="themed-select"
                    >
                        <option value="cuemu">CUEmu</option>
                    </select>
                </div>

                <AuthWidget onOpenMgmt={() => setIsMgmtOpen(true)} />
            </div>
            
            <ManagementModal 
                isOpen={isMgmtOpen} 
                onClose={() => setIsMgmtOpen(false)} 
                serverId={selectedServer} 
            />
        </header>
    );
};

export default Header;