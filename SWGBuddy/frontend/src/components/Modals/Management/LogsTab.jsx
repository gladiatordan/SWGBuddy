import React, { useState, useEffect } from 'react';
import API from '../../../services/api';
import { useServer } from '../../../contexts/ServerContext';

const LogsTab = () => {
    const { selectedServer } = useServer();
    const [logs, setLogs] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [expandedLogId, setExpandedLogId] = useState(null); // Track the open JSON viewer
    const [loading, setLoading] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            // Replicating API.fetchCommandLog(serverId, page, limit, search)
            const data = await API.fetchCommandLog(selectedServer, page, 20, search);
            setLogs(data.logs || []);
            setTotalPages(data.pages || 1);
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [selectedServer, page, search]);

    const toggleLog = (id) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search Header ported from management.js */}
            <div className="mgmt-search-container" style={{ marginBottom: '10px' }}>
                <input 
                    type="text" 
                    className="mgmt-search-input" 
                    placeholder="Search logs (User, Command, Resource)..." 
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1); // Reset to first page on new search
                    }}
                />
                <button className="mgmt-refresh-btn" onClick={() => fetchLogs()}>
                    <i className="fa-solid fa-search"></i>
                </button>
            </div>

            <div className="log-table-wrapper" style={{ flex: 1, minHeight: 0 }}>
                <table className="log-table">
                    <thead>
                        <tr>
                            <th width="180">Date</th>
                            <th>User</th>
                            <th width="150">Command</th>
                            <th>Details Preview</th>
                            <th width="50"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>Loading logs...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No records found.</td></tr>
                        ) : (
                            logs.map(log => (
                                <React.Fragment key={log.id}>
                                    {/* Main Row ported from management.js */}
                                    <tr className="log-row" onClick={() => toggleLog(log.id)}>
                                        <td className="log-date">{new Date(log.timestamp * 1000).toLocaleString()}</td>
                                        <td className="log-user">
                                            <div style={{ display: 'flex', alignContent: 'center', gap: '8px' }}>
                                                {/* Avatar logic ported from management.js */}
                                                <img 
                                                    src={log.avatar_url ? `https://cdn.discordapp.com/avatars/${log.user_id}/${log.avatar_url}.png` : '/static/img/default-avatar.png'} 
                                                    className="mgmt-avatar-small" 
                                                    style={{ width: '24px', height: '24px' }} 
                                                    alt="" 
                                                />
                                                <span>{log.username}</span>
                                            </div>
                                        </td>
                                        <td className="log-cmd">
                                            <span className="cmd-badge">{log.command}</span>
                                        </td>
                                        <td className="log-preview">
                                            {log.details.name ? `Resource: ${log.details.name}` : 
                                             log.details.target_user_id ? `Target: ${log.details.target_user_id}` : 
                                             'Click to view details'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <i className={`fa-solid fa-chevron-${expandedLogId === log.id ? 'up' : 'down'}`}></i>
                                        </td>
                                    </tr>

                                    {/* Collapsible Detail Row */}
                                    {expandedLogId === log.id && (
                                        <tr className="log-detail-row">
                                            <td colSpan="5">
                                                <div className="log-json-viewer">
                                                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination ported from management.js */}
            <div className="pagination-controls" style={{ justifyContent: 'center', marginTop: '10px' }}>
                <button 
                    className="page-nav-btn" 
                    disabled={page === 1} 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                    ‹
                </button>
                <span style={{ padding: '0 10px' }}>Page {page} of {totalPages}</span>
                <button 
                    className="page-nav-btn" 
                    disabled={page === totalPages} 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                    ›
                </button>
            </div>
        </div>
    );
};

export default LogsTab;