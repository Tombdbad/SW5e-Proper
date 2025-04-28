import { Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { useAudio } from "./lib/stores/useAudio";
import Home from "./pages/Home";
import CharacterCreation from "./pages/CharacterCreation";
import CharacterManagement from "./pages/CharacterManagement";
import CampaignView from "./pages/CampaignView";
import GameBoard from "./pages/GameBoard";
import NotFound from "./pages/not-found";

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
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/character/create" element={<CharacterCreation />} />
        <Route path="/character/manage/:id" element={<CharacterManagement />} />
        <Route path="/campaign/:id" element={<CampaignView />} />
        <Route path="/game/:campaignId" element={<GameBoard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
