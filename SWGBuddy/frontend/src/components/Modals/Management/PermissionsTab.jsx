import React, { useState, useEffect, useMemo } from 'react';
import API from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';

const PermissionsTab = ({ serverId }) => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // New State for Update Logic
    const [pendingRole, setPendingRole] = useState('');
    const [updating, setUpdating] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);

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

    // Sync pending role when user selection changes
    useEffect(() => {
        if (selectedUser) {
            setPendingRole(selectedUser.role);
            setStatusMsg(null);
        }
    }, [selectedUser]);

    const filteredUsers = useMemo(() => {
        return users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    }, [users, search]);

    const handleUpdateRole = async () => {
        if (!selectedUser) return;

        // Prevent self-editing
        if (selectedUser.id === currentUser.id) {
            setStatusMsg({ type: 'error', text: "You cannot modify your own permissions." });
            return;
        }

        setUpdating(true);
        setStatusMsg(null);

        try {
            await API.setRole(selectedUser.id, pendingRole, serverId);
            
            // Success Feedback
            setStatusMsg({ type: 'success', text: `Successfully updated ${selectedUser.username} to ${pendingRole}` });
            
            // Update local state to reflect change immediately
            const updatedUser = { ...selectedUser, role: pendingRole };
            setSelectedUser(updatedUser);
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedUser : u));

            // Background refresh to ensure consistency (optional, but good practice)
            fetchUsers(); 
        } catch (err) {
            setStatusMsg({ type: 'error', text: "Failed to update role: " + err.message });
        } finally {
            setUpdating(false);
        }
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
                            
                            <select 
                                className="themed-select" 
                                style={{width:'100%', border:'1px solid var(--border-color)'}}
                                value={pendingRole}
                                onChange={(e) => setPendingRole(e.target.value)}
                            >
                                {ROLES_HIERARCHY.map((role, idx) => {
                                    // Determine effective role level for hierarchy check
                                    // Fixed: Use serverId prop instead of undefined 'selectedServer'
                                    const myRole = currentUser.is_superadmin ? 'SUPERADMIN' : (currentUser.server_perms?.[serverId] || 'GUEST');
                                    const myLevel = ROLES_HIERARCHY.indexOf(myRole);

                                    // HIERARCHY RULE: You cannot assign a role equal to or higher than your own
                                    if (idx >= myLevel && !currentUser.is_superadmin) return null;
                                    
                                    // Only Superadmins can assign the Superadmin role
                                    if (role === 'SUPERADMIN' && !currentUser.is_superadmin) return null;

                                    return <option key={role} value={role}>{role}</option>;
                                })}
                            </select>

                            {/* Status Message */}
                            {statusMsg && (
                                <div className={`status-bar status-${statusMsg.type}`} style={{marginTop: '15px', padding: '8px', fontSize: '0.9rem'}}>
                                    {statusMsg.text}
                                </div>
                            )}

                            {/* Update Button */}
                            <button 
                                className="btn-primary" 
                                style={{marginTop: '15px', width: '100%'}}
                                onClick={handleUpdateRole}
                                disabled={updating || pendingRole === selectedUser.role}
                            >
                                {updating ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin" style={{marginRight: '8px'}}></i>
                                        Updating...
                                    </>
                                ) : 'Update Role'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PermissionsTab;