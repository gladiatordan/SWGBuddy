import React from 'react';

const Loader = ({ message = "INITIALIZING DATAPAD...", fadeOut = false }) => (
    <div id="page-loader" className={`page-loader ${fadeOut ? 'fade-out' : ''}`}>
        <div className="spinner"></div>
        <div className="loader-text">{message}</div>
    </div>
);

export default Loader;