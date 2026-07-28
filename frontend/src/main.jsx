import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PairSwipe from './components/PairSwipe.jsx'
import './index.css'

function Root() {
  const pairMatch = window.location.pathname.match(/^\/pair\/([^/]+)/)
  if (pairMatch) return <PairSwipe code={pairMatch[1]} />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
