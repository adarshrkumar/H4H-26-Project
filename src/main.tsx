import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initPolyfill } from '@webspatial/react-sdk'
import './index.css'
import App from './App.tsx'

initPolyfill()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
