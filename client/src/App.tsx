
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import CharacterCreation from './pages/CharacterCreation';
import CharacterManagement from './pages/CharacterManagement';
import CampaignView from './pages/CampaignView';
import GalacticMapView from './pages/GalacticMapView';
import GameBoard from './pages/GameBoard';
import NotFound from './pages/not-found';
import { PerformanceMonitor, PerformanceMetricsDisplay } from './lib/performance/monitor';
import { useCharacter } from './lib/stores/useCharacter';
import { useCampaign } from './lib/stores/useCampaign';
import { Toaster } from './components/ui/sonner';
import { usePerformance } from './lib/performance/monitor';
import LoadingDemo from './pages/LoadingDemo';

// Global keyboard shortcut for performance display
function PerformanceControls() {
  const { isDebugEnabled, setDebugEnabled } = usePerformance();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P to toggle performance display
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
        setDebugEnabled(!isDebugEnabled);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDebugEnabled, setDebugEnabled]);
  
  return null;
}

function App() {
  const navigate = useNavigate();
  const { fetchCharacters } = useCharacter();
  const { fetchCampaigns } = useCampaign();
  const [showDevTools, setShowDevTools] = useState(false);
  
  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([
          fetchCharacters(),
          fetchCampaigns()
        ]);
      } catch (error) {
        console.error("Error loading initial data:", error);
      }
    };
    
    loadInitialData();
  }, [fetchCharacters, fetchCampaigns]);
  
  // Toggle developer tools with Ctrl+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        setShowDevTools(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  return (
    <PerformanceMonitor>
      <div className="flex flex-col min-h-screen bg-background">
        <Toaster position="top-right" />
        <PerformanceControls />
        
        {/* Performance metrics display will only show when debug is enabled */}
        <PerformanceMetricsDisplay 
          position="bottom-right"
          showFps={true}
          showMemory={true}
          showRenders={true}
          showTimings={true}
        />
        
        {showDevTools && (
          <div className="fixed top-0 right-0 bg-black/80 text-white p-2 text-xs z-50">
            <h3 className="font-bold mb-1">Dev Tools</h3>
            <div className="grid grid-cols-2 gap-1">
              <button 
                className="bg-blue-800 px-2 py-1 rounded"
                onClick={() => navigate('/dev/loading')}
              >
                Loading Components
              </button>
              <button 
                className="bg-purple-800 px-2 py-1 rounded"
                onClick={() => setShowDevTools(false)}
              >
                Close Toolbar
              </button>
            </div>
          </div>
        )}
        
        <div className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/characters/create" element={<CharacterCreation />} />
            <Route path="/characters/edit/:id" element={<CharacterCreation />} />
            <Route path="/characters" element={<CharacterManagement />} />
            <Route path="/campaigns/:id" element={<CampaignView />} />
            <Route path="/map" element={<GalacticMapView />} />
            <Route path="/game/:campaignId" element={<GameBoard />} />
            <Route path="/dev/loading" element={<LoadingDemo />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </PerformanceMonitor>
  );
}

export default App;
