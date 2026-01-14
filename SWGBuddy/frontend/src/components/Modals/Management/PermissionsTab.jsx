import React, { useState, useEffect, useMemo } from 'react';
import API from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';

const PermissionsTab = ({ serverId }) => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const ROLES_HIERARCHY = ['GUEST', 'USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'];

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await API.fetchManagedUsers(serverId);
            setUsers(data.users || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, [serverId]);

    const filteredUsers = useMemo(() => {
        return users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    }, [users, search]);

    const handleUpdateRole = async (newRole) => {
		// Prevent self-editing to avoid accidental lockout
		if (selectedUser.id === currentUser.id) {
			alert("You cannot modify your own permissions through this interface.");
			return;
		}

		try {
			// serverId is now pulled from ServerContext or passed as a prop
			await API.setRole(selectedUser.id, newRole, serverId);
			alert(`Successfully updated ${selectedUser.username} to ${newRole}`);
			fetchUsers(); // Re-sync the list to show the new role
		} catch (err) {
			alert("Failed to update role: " + err.message);
		}
	};

	const renderRoleOptions = () => {
		// Roles and levels aligned with backend validation.py and auth.js
		const ROLES_HIERARCHY = ['GUEST', 'USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'];
		
		// Determine the current user's effective role level for this server
		const myRole = currentUser.is_superadmin ? 'SUPERADMIN' : (currentUser.server_perms?.[serverId] || 'GUEST');
		const myLevel = ROLES_HIERARCHY.indexOf(myRole);

		return ROLES_HIERARCHY.map((role, idx) => {
			// HIERARCHY RULES: 
			// 1. You cannot assign a role equal to or higher than your own.
			// 2. Regular Admins (idx 3) can assign up to EDITOR (idx 2).
			if (idx >= myLevel && !currentUser.is_superadmin) return null;
			
			// 3. Prevent assigning SUPERADMIN via UI unless backend specifically supports it.
			// Typically, SUPERADMIN is a database-level flag.
			if (role === 'SUPERADMIN' && !currentUser.is_superadmin) return null;

			return (
				<option key={role} value={role}>
					{role}
				</option>
			);
		});
	};

    const getAvatar = (u) => `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;

    return (
        <div className="permissions-layout">
            <div className="user-list-pane">
                <div className="mgmt-search-container">
                    <input 
                        type="text" 
                        className="mgmt-search-input" 
                        placeholder="Filter users..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="mgmt-refresh-btn" onClick={fetchUsers} title="Refresh">
                        <i className="fa-solid fa-rotate-right"></i>
                    </button>
                </div>
                <div className="user-list-scroll-area">
                    {loading ? <div style={{padding:'10px', color:'#888'}}>Loading users...</div> : (
                        filteredUsers.map(u => (
                            <div 
                                key={u.id} 
                                className={`mgmt-user-item ${selectedUser?.id === u.id ? 'selected' : ''}`}
                                onClick={() => setSelectedUser(u)}
                            >
                                <img src={getAvatar(u)} className="mgmt-avatar-small" alt="" />
                                <div>
                                    <div style={{fontWeight:'bold', color:'var(--text-main)'}}>{u.username}</div>
                                    <div className="mgmt-user-role">{u.role}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="user-detail-pane">
                {!selectedUser ? (
                    <div style={{opacity:0.5, marginTop:'20px'}}>Select a user to edit</div>
                ) : (
                    <>
                        <img src={getAvatar(selectedUser)} className="mgmt-avatar-large" alt="" />
                        <div className="mgmt-username-large">{selectedUser.username}</div>
                        <div className="role-select-container">
                            <label style={{color:'var(--text-dim)', fontSize:'0.8rem', marginBottom:'5px', display:'block'}}>SET ROLE</label>
                            
                            {/* INTEGRATED ROLE OPTIONS LOGIC */}
                            <select 
                                className="themed-select" 
                                style={{width:'100%', border:'1px solid var(--border-color)'}}
                                value={selectedUser.role}
                                onChange={(e) => handleUpdateRole(e.target.value)}
                            >
                                {ROLES_HIERARCHY.map((role, idx) => {
                                    // Determine effective role level for hierarchy check
                                    const myRole = currentUser.is_superadmin ? 'SUPERADMIN' : (currentUser.server_perms?.[selectedServer] || 'GUEST');
                                    const myLevel = ROLES_HIERARCHY.indexOf(myRole);

                                    // HIERARCHY RULE: You cannot assign a role equal to or higher than your own
                                    if (idx >= myLevel && !currentUser.is_superadmin) return null;
                                    
                                    // Only Superadmins can assign the Superadmin role
                                    if (role === 'SUPERADMIN' && !currentUser.is_superadmin) return null;

                                    return <option key={role} value={role}>{role}</option>;
                                })}
                            </select>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PermissionsTab;