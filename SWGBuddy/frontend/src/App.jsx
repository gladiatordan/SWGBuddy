import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ServerProvider } from './contexts/ServerContext';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import Loader from './components/Common/Loader';
import ResourceList from './components/ResourceTable/ResourceList';
import SchematicContainer from './components/Schematics/SchematicContainer';


function App() {
    // 1. Centralized Application State
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page');
        
        // precise mapping of allowed pages
        if (page === 'schematics') return 'schematics';
        if (page === 'management') return 'management';
        return 'resources'; // Default
    });
    const [selectedServer, setSelectedServer] = useState('cuemu');
    
    // 2. Loading State
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [shouldRenderLoader, setShouldRenderLoader] = useState(true);

    // Initial Boot
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsAppLoading(false);
            setTimeout(() => setShouldRenderLoader(false), 500);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    // Tab Switching Logic
    const handleTabChange = (tab) => {
        if (tab === activeTab) return;
        
        setShouldRenderLoader(true);
        setIsTransitioning(true);
        setActiveTab(tab);

        setTimeout(() => {
            setIsTransitioning(false);
            setTimeout(() => setShouldRenderLoader(false), 500);
        }, 400);

		const params = new URLSearchParams(window.location.search);
        params.set('page', tabName);
        
        // Clear item-specific params when switching contexts
        if (tabName !== 'resources') params.delete('resource');
        
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({}, '', newUrl);
    };

    return (
        <AuthProvider>
			<ServerProvider>
				{/* Global Loader Overlay */}
				{shouldRenderLoader && (
					<Loader 
						message={isAppLoading ? "INITIALIZING DATAPAD..." : "ACCESSING DATAPAD..."} 
						fadeOut={!isAppLoading && !isTransitioning} 
					/>
				)}
				{/* Header controls App State */}
				<Header 
					activeTab={activeTab} 
					setActiveTab={handleTabChange}
					selectedServer={selectedServer}
					setSelectedServer={setSelectedServer}
				/>
				<div className="app-container">
					<main id="main-content">
						{!isTransitioning && (
							<>
								{activeTab === 'resources' && <ResourceList serverId={selectedServer} />}
								
								{activeTab === 'schematics' && <SchematicContainer serverId={selectedServer} />}
							</>
						)}
					</main>
				</div>
				<Footer />
			</ServerProvider>
        </AuthProvider>
    );
}

export default App;