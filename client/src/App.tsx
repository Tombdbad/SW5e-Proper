
import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import NotFound from './pages/not-found';

// Each page loads when it is first opened, with the rules data it needs. The home page stays small.
const CharacterCreation = lazy(() => import('./pages/CharacterCreation'));
const CharacterManagement = lazy(() => import('./pages/CharacterManagement'));
const CampaignView = lazy(() => import('./pages/CampaignView'));
const GalacticMapView = lazy(() => import('./pages/GalacticMapView'));
const GameBoard = lazy(() => import('./pages/GameBoard'));
import { Toaster } from './components/ui/sonner';
const LoadingDemo = lazy(() => import('./pages/LoadingDemo'));

function App() {
  const navigate = useNavigate();
  const [showDevTools, setShowDevTools] = useState(false);
  
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
      <div className="flex flex-col min-h-screen bg-background">
        <Toaster position="top-right" />
        
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
          <Suspense fallback={<div className="p-6 text-center text-gray-300">Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/characters/create" element={<CharacterCreation />} />
            <Route path="/characters/edit/:id" element={<CharacterCreation />} />
            <Route path="/characters" element={<Navigate to="/" replace />} />
            <Route path="/characters/:id" element={<CharacterManagement />} />
            <Route path="/campaigns" element={<CampaignView />} />
            <Route path="/campaigns/:id" element={<CampaignView />} />
            <Route path="/map" element={<GalacticMapView />} />
            <Route path="/game/:campaignId" element={<GameBoard />} />
            <Route path="/dev/loading" element={<LoadingDemo />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </div>
      </div>
  );
}

export default App;
