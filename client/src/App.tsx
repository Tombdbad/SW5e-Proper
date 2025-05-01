import { Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { useAudio } from "./lib/stores/useAudio";
import StarfieldBackground from "./components/ui/StarfieldBackground";
import Home from "./pages/Home";
import CharacterCreation from "./pages/CharacterCreation";
import CharacterManagement from "./pages/CharacterManagement";
import CampaignView from "./pages/CampaignView";
import GameBoard from "./pages/GameBoard";
import GalacticMapView from "./pages/GalacticMapView";
import NotFound from "./pages/not-found";
import LoadingDemo from "./pages/LoadingDemo"; // Added import
import { PerformanceMonitor } from './lib/performance/monitor'; // Added import


function App() {
  const [loaded, setLoaded] = useState(false);
  const { setBackgroundMusic, setHitSound, setSuccessSound } = useAudio();

  // Load audio assets
  useEffect(() => {
    // Background music
    const bgMusic = new Audio("/sounds/background.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.3;
    setBackgroundMusic(bgMusic);

    // Hit sound effect
    const hit = new Audio("/sounds/hit.mp3");
    setHitSound(hit);

    // Success sound effect
    const success = new Audio("/sounds/success.mp3");
    setSuccessSound(success);

    setLoaded(true);
  }, [setBackgroundMusic, setHitSound, setSuccessSound]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Loading...
      </div>
    );
  }

  return (
    <PerformanceMonitor> {/* Added PerformanceMonitor */}
      <StarfieldBackground starCount={300} speed={0.3} starColor="#FFFFDD">
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/character/create" element={<CharacterCreation />} />
          <Route path="/character/manage/:id" element={<CharacterManagement />} />
          <Route path="/campaign/:id" element={<CampaignView />} />
          <Route path="/game/:campaignId" element={<GameBoard />} />
          <Route path="/map/galaxy" element={<GalacticMapView />} />
          <Route path="/loading-demo" element={<LoadingDemo />} /> {/* Added route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </StarfieldBackground>
    </PerformanceMonitor> 
  );
}

export default App;