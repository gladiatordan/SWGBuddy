import React, { createContext, useContext, useState, useEffect } from 'react';

const ServerContext = createContext();

export const ServerProvider = ({ children }) => {
    // Default to 'cuemu' as seen in original index.html
    const [selectedServer, setSelectedServer] = useState(() => {
        return localStorage.getItem('swgbuddy_server_context') || 'cuemu';
    });

    // Persist choice to localStorage for return visits
    useEffect(() => {
        localStorage.setItem('swgbuddy_server_context', selectedServer);
    }, [selectedServer]);

    return (
        <ServerContext.Provider value={{ selectedServer, setSelectedServer }}>
            {children}
        </ServerContext.Provider>
    );
};

export const useServer = () => {
    const context = useContext(ServerContext);
    if (!context) {
        throw new Error('useServer must be used within a ServerProvider');
    }
    return context;
};