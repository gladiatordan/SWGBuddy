import React, { createContext, useContext, useState, useEffect } from 'react';

const ServerContext = createContext();

export const useServer = () => {
    const context = useContext(ServerContext);
    if (!context) throw new Error('useServer must be used within a ServerProvider');
    return context;
};

export const ServerProvider = ({ children }) => {
    // 1. Initialize state from URL if present, otherwise default to 'cuemu'
    const [selectedServer, setSelectedServer] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('server') || 'cuemu';
    });

	const [serverList, setServerList] = useState([]);

	useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('server') !== selectedServer) {
            params.set('server', selectedServer);
            // Update URL without reloading page
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', newUrl);
        }
    }, [selectedServer]);

    // Persist choice to localStorage for return visits
    useEffect(() => {
        localStorage.setItem('swgbuddy_server_context', selectedServer);
    }, [selectedServer]);

	const value = {
        selectedServer,
        setSelectedServer,
        serverList
    };

    return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
};