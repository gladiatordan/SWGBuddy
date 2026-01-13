import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Replaces Auth.checkSession()
    useEffect(() => {
        const initAuth = async () => {
            try {
                const data = await API.fetchCurrentUser();
                if (data.authenticated) {
                    setUser(data);
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error("Auth check failed:", error);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        initAuth();
    }, []);

    // Helper to check permissions (Ported from auth.js ROLES logic)
    const hasPermission = (requiredRole) => {
        if (!user) return false;
        if (user.is_superadmin) return true;

        const ROLES = {
            'SUPERADMIN': 100,
            'ADMIN': 3,
            'EDITOR': 2,
            'USER': 1,
            'GUEST': 0
        };

        // Default to current server context (we will handle server context later, defaulting to cuemu for now)
        const serverId = 'cuemu'; 
        const userRole = user.server_perms?.[serverId] || 'GUEST';
        
        const currentLevel = ROLES[userRole] || 0;
        const requiredLevel = ROLES[requiredRole] || 0;

        return currentLevel >= requiredLevel;
    };

    return (
        <AuthContext.Provider value={{ user, loading, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);