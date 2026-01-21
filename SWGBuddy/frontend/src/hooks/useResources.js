import { useContext } from 'react';
import { ResourceContext } from '../contexts/ResourceContext';

export const useResources = (serverId = 'cuemu') => {
    const context = useContext(ResourceContext);
    if (!context) {
        throw new Error('useResources must be used within a ResourceProvider');
    }
    return context;
};

// Helper just to pass raw data through (React state handles the array)
const rawResourceDataToRender = (data) => data;