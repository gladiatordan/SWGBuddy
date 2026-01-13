import React, { useState } from 'react';
import AuthWidget from '../Auth/AuthWidget';

const Header = () => {
    // State to track active tab (Resources vs Schematics)
    const [activeTab, setActiveTab] = useState('resources');
    // State for server selection
    const [selectedServer, setSelectedServer] = useState('cuemu');

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
                    >
                        <option value="cuemu">CUEmu</option>
                    </select>
                </div>

                <AuthWidget />
            </div>
            
            {/* Management Modal Placeholder - We will build this in Phase 4 */}
            <div id="management-modal" className="modal hidden"></div>
        </header>
    );
};

export default Header;