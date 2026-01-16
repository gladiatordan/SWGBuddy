// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Import your existing CSS structure
import './assets/css/variables.css'
import './assets/css/base.css'
import './assets/css/header.css'
import './assets/css/footer.css'
import './assets/css/management.css'

// Resources Container
import './assets/css/pages/resources/table.css'
import './assets/css/pages/resources/filters.css'
import './assets/css/pages/resources/modal.css'
import './assets/css/pages/resources/planets.css'
import './assets/css/pages/resources/status.css'
import './assets/css/pages/resources/pagination.css'

// Schematics Container
import './assets/css/pages/schematics/schematics.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)