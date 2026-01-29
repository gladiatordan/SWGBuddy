// frontend/src/services/api.js

/**
 * API Wrapper - React Version
 * Removes DOM dependencies. serverId must be passed in or handled by Context.
 */

const API = {
    // Helper for Fetch
    async _fetch(url, options = {}) {
        if (!options.headers) options.headers = {};
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
        
        const response = await fetch(url, options);
        if (!response.ok) {
            let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                // Ignore JSON parse error
            }
            throw new Error(errorMessage);
        }
        return response;
    },

    async fetchCurrentUser() {
        const response = await this._fetch('/api/me');
        return await response.json();
    },

    async fetchResources(serverId, since = 0) {
        const response = await this._fetch(`/api/resource_log?server=${serverId}&since=${since}`);
        return await response.json();
    },

    async fetchTaxonomy(serverId) {
        const response = await this._fetch(`/api/${serverId}/taxonomy`);
        return await response.json();
    },

    async addResource(data, serverId) {
        data.server_id = serverId;
        const response = await this._fetch('/api/add-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    async updateResource(data, serverId) {
        data.server_id = serverId;
        const response = await this._fetch('/api/update-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    async retireResource(id, serverId) {
        const data = { id: id, server_id: serverId };
        const response = await this._fetch('/api/retire-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    // Admin Functions
    async fetchManagedUsers(serverId) {
        const response = await this._fetch(`/api/admin/users?server=${serverId}`);
        return await response.json();
    },

    async setRole(targetUserId, role, serverId) {
        const data = { target_user_id: targetUserId, role: role, server_id: serverId };
        const response = await this._fetch('/api/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    async fetchCommandLog(serverId, page=1, limit=25, search='') {
        const q = `server=${serverId}&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        const response = await this._fetch(`/api/admin/command-log?${q}`);
        return await response.json();
    },

    async scanImage(formData) {
         const response = await fetch('/api/scan-image', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest' 
            },
            body: formData
        });
        return await response.json();
    },

	async fetchSchematicIndex(serverId) {
        const response = await this._fetch(`/api/schematics/index?server=${serverId}`);
        return await response.json();
    },

	async fetchSchematicDetails(schematicId, serverId) {
        const response = await this._fetch(`/api/schematics/${schematicId}?server=${serverId}`);
        return await response.json();
    },

    async checkSchematicUpdates(serverId, schematicIds) {
        const response = await this._fetch('/api/schematics/updates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server: serverId, ids: schematicIds })
        });
        return await response.json();
    },

	async recalculateRankings(serverId) {
        // Requires Superadmin
        const response = await api.post('/admin/recalc-rankings', { server_id: serverId });
		// console.log('Recalculate Rankings Response:', response);
        return response.data;
    }
};

export default API;