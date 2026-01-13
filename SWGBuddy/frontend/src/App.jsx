import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import Loader from './components/Common/Loader';
import ResourceList from './components/ResourceTable/ResourceList';

function App() {
    const [activeTab, setActiveTab] = useState('resources');
    const [isAppLoading, setIsAppLoading] = useState(true); // Initial site boot
    const [isTransitioning, setIsTransitioning] = useState(false); // Tab switching
    const [shouldRenderLoader, setShouldRenderLoader] = useState(true);

    // 1. Initial Site Boot (Mimics app.js DOMContentLoaded logic)
    useEffect(() => {
        // We give the App/Auth a moment to initialize
        const timer = setTimeout(() => {
            setIsAppLoading(false);
            // Wait for CSS fade-out animation (0.5s in base.css) before unmounting
            setTimeout(() => setShouldRenderLoader(false), 500);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    // 2. Tab Switching Logic (The "Container" Transition)
    const handleTabChange = (tab) => {
        if (tab === activeTab) return;
        
        setShouldRenderLoader(true);
        setIsTransitioning(true);
        
        // Change the tab data immediately underneath the loader
        setActiveTab(tab);

        // Hold the loader overlay briefly for the "Datapad" feel
        setTimeout(() => {
            setIsTransitioning(false);
            // Match the fade-out timing
            setTimeout(() => setShouldRenderLoader(false), 500);
        }, 400); 
    };

    return (
        <AuthProvider>
            {/* THE LOADER OVERLAY 
                Rendered at the root so it sits on top of everything via z-index: 9999
            */}
            {shouldRenderLoader && (
                <Loader 
                    message={isAppLoading ? "INITIALIZING DATAPAD..." : "ACCESSING DATAPAD..."} 
                    fadeOut={!isAppLoading && !isTransitioning} 
                />
            )}

            <div className="app-container">
                {/* Header and Footer are RENDERED immediately and never move */}
                <Header activeTab={activeTab} setActiveTab={handleTabChange} />
                
                <main id="main-content">
                    {/* The content changes here, but is hidden by the Loader overlay above */}
                    {activeTab === 'resources' && <ResourceList />}
                    {activeTab === 'schematics' && (
                        <section id="schematics-container" className="page-container active">
                            <div className="placeholder-msg">Schematics functionality coming soon...</div>
                        </section>
                    )}
                </main>

                <Footer />
            </div>
        </AuthProvider>
    );
}

export default App;