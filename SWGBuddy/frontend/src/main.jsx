// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Import your existing CSS structure
import './assets/css/variables.css'
import './assets/css/base.css'
import './assets/css/footer.css'
// We will import specific component CSS (like tables/modals) in their specific components later, 
// or import them all here for now to ensure 1:1 parity immediately.
import './assets/css/resourcelog/table.css'
import './assets/css/resourcelog/filters.css'
import './assets/css/resourcelog/modal.css'
import './assets/css/resourcelog/planets.css'
import './assets/css/resourcelog/status.css'
import './assets/css/resourcelog/pagination.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)