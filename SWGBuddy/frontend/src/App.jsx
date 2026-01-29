// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ServerProvider } from './contexts/ServerContext';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import Loader from './components/Common/Loader';
import ResourceList from './components/ResourceTable/ResourceList';
import SchematicContainer from './components/Schematics/SchematicContainer';
import { ResourceProvider } from './contexts/ResourceContext';

// Helper component to handle legacy ?page=... URLs
const LegacyRedirect = () => {
    const [searchParams] = useSearchParams();
    const page = searchParams.get('page');

    if (page === 'schematics') return <Navigate to="/schematics" replace />;
    if (page === 'resources') return <Navigate to="/resources" replace />;
    
    // Default fallback
    return <Navigate to="/resources" replace />;
};

function App() {
    const [selectedServer, setSelectedServer] = useState('cuemu');
    
    // 1. Loading State
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [shouldRenderLoader, setShouldRenderLoader] = useState(true);

    // Initial Boot
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsAppLoading(false);
            setTimeout(() => setShouldRenderLoader(false), 500);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    return (
        <AuthProvider>
            <ServerProvider>
                <Header 
                    selectedServer={selectedServer}
                    setSelectedServer={setSelectedServer}
                />
                <ResourceProvider serverId={selectedServer}>
                    <div className="app-container">
                        <main id="main-content">
                            {shouldRenderLoader && (
                                <Loader 
                                    message={isAppLoading ? "INITIALIZING DATAPAD..." : "ACCESSING DATAPAD..."} 
                                    fadeOut={!isAppLoading} 
                                />
                            )}
                            
                            <Routes>
                                <Route path="/resources" element={<ResourceList />} />
                                <Route path="/schematics" element={<SchematicContainer />} />
                                <Route path="/management" element={<div />} /> {/* Empty route for modal background */}
                                <Route path="/" element={<LegacyRedirect />} />
                                <Route path="*" element={<Navigate to="/resources" replace />} />
                            </Routes>

                        </main>
                    </div>
                </ResourceProvider>
                <Footer />
            </ServerProvider>
        </AuthProvider>
    );
}

export default App;