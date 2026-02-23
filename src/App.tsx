import Panorama from './Panorama'
import './App.css'

function App() {
    return (
        <div className="app-container">
            <Panorama />
            <div className="ui-overlay">
                <h1>360° Vision Pro Experience</h1>
                <p>Click "Enter VR" to start immersive mode.</p>
            </div>
        </div>
    )
}

export default App
