import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const AuthWidget = ({ onOpenMgmt }) => {
    const { user, loading, hasPermission } = useAuth();
    // Replaces the "openServerManagement" onclick handler
    const [dropdownOpen, setDropdownOpen] = useState(false);

    if (loading) return <div className="auth-section">Loading...</div>;

    if (!user) {
        // Render Login Button
        return (
            <div className="auth-section">
                <a href="/login" className="btn-discord">
                    <i className="fa-brands fa-discord"></i> Login
                </a>
            </div>
        );
    }

    // Determine Avatar URL (Ported logic)
    const avatarUrl = user.avatar.startsWith('http') 
        ? user.avatar 
        : `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;

    // Determine Role Display
    // Note: We are hardcoding 'cuemu' for now as we haven't built the ServerContext yet
    const currentRole = user.server_perms?.['cuemu'] || 'GUEST';
    const roleClass = `role-${currentRole.toLowerCase()}`;

    return (
        <div className="auth-section">
            <div 
                className="user-profile-container" 
                onMouseEnter={() => setDropdownOpen(true)}
                onMouseLeave={() => setDropdownOpen(false)}
            >
                <div className="user-profile">
                    <img src={avatarUrl} className="user-avatar" alt="User" style={{objectFit: 'cover'}} />
                    <div className="user-info">
                        <span className="username">{user.username}</span>
                        <span className={`role-badge ${roleClass}`}>{currentRole}</span>
                    </div>
                </div>
                
                {dropdownOpen && (
                    <div className="user-dropdown-menu">
                        {hasPermission('EDITOR') && (
                            <div 
                                className="dropdown-item" 
                                onClick={() => {
                                    setDropdownOpen(false);
                                    onOpenMgmt(); // Triggers the modal state in Header.jsx
                                }}
                            >
                                <i className="fa-solid fa-server"></i> Server Management
                            </div>
                        )}
                        <a href="/logout" className="dropdown-item">
                            <i className="fa-solid fa-sign-out-alt"></i> Logout
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthWidget;