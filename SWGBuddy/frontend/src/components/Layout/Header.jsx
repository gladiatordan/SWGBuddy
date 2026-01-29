// frontend/src/components/Layout/Header.jsx
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import AuthWidget from '../Auth/AuthWidget';
import ManagementModal from '../Modals/ManagementModal';

const Header = ({ selectedServer, setSelectedServer }) => {
    const [isMgmtOpen, setIsMgmtOpen] = useState(false);
    
    return (
        <header className="main-header">
            <div className="logo"><span>SWG</span>BUDDY</div>
            
            <nav className="top-nav">
                <NavLink 
                    to="/resources" 
                    className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
                >
                    RESOURCES
                </NavLink>
                <NavLink 
                    to="/schematics" 
                    className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
                >
                    SCHEMATICS
                </NavLink>
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