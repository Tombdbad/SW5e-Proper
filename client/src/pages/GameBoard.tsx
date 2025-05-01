import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GalaxyMap from "@/components/Map/GalaxyMap";
import LocalMap from "@/components/Map/LocalMap";
import CombatTracker from "@/components/Combat/CombatTracker";
import { useCharacter } from "@/lib/stores/useCharacter";
import { useCampaign } from "@/lib/stores/useCampaign";
import { useCombat } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";

// Define control keys for the game
const controls = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "backward", keys: ["KeyS", "ArrowDown"] },
  { name: "leftward", keys: ["KeyA", "ArrowLeft"] },
  { name: "rightward", keys: ["KeyD", "ArrowRight"] },
  { name: "action", keys: ["KeyE", "Space"] },
  { name: "menu", keys: ["Escape", "Tab"] },
];

export default function GameBoard() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeMapTab, setActiveMapTab] = useState<"galaxy" | "local">("galaxy");
  const [showCombat, setShowCombat] = useState(false);
  const { character } = useCharacter();
  const { campaign, loadCampaign } = useCampaign();
  const { inCombat, initiateCombat, endCombat } = useCombat();
  const { currentLocation, setCurrentLocation } = useMap();

  // Fetch campaign data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  // Load campaign data when available
  useEffect(() => {
    if (data && !isLoading) {
      loadCampaign(data);
      
      // Set initial location if available
      if (data.startingLocation) {
        setCurrentLocation(data.startingLocation);
      }
    }
  }, [data, isLoading, loadCampaign, setCurrentLocation]);

  // Show combat UI when in combat
  useEffect(() => {
    setShowCombat(inCombat);
  }, [inCombat]);

  // Toggle sidebar
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

    // Import GM Report Manager
  import GMReportManager from "@/components/Campaign/GMReportManager";

  // Start combat (test)
  const startTestCombat = () => {
    if (!character) return;
    
    const enemies = [
      { id: 1, name: "Stormtrooper", hp: 30, maxHp: 30, initiative: 12 },
      { id: 2, name: "Imperial Officer", hp: 20, maxHp: 20, initiative: 14 },
    ];
    
    initiateCombat(character, enemies);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  if (error || !campaign || !character) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl mb-4">Failed to load game</div>
        <Link to="/">
          <Button>Return to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <KeyboardControls map={controls}>
        {/* 3D Map Canvas */}
        <Canvas
          shadows
          camera={{
            position: [0, 15, 15],
            fov: 75,
            near: 0.1,
            far: 1000
          }}
          gl={{
            antialias: true,
            powerPreference: "default"
          }}
        >
          <color attach="background" args={["#000000"]} />
          
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1} 
            castShadow 
            shadow-mapSize-width={2048} 
            shadow-mapSize-height={2048} 
          />
          
          {/* Maps */}
          {activeMapTab === "galaxy" ? (
            <GalaxyMap />
          ) : (
            <LocalMap />
          )}
        </Canvas>

        {/* UI Overlay */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <Card className="bg-gray-800 bg-opacity-80 text-white px-4 py-2">
            <div className="flex space-x-4">
              <Button 
                variant={activeMapTab === "galaxy" ? "default" : "outline"} 
                onClick={() => setActiveMapTab("galaxy")}
              >
                Galaxy Map
              </Button>
              <Button 
                variant={activeMapTab === "local" ? "default" : "outline"} 
                onClick={() => setActiveMapTab("local")}
              >
                Local Map
              </Button>
              <Button variant="outline" onClick={toggleSidebar}>
                {showSidebar ? "Hide HUD" : "Show HUD"}
              </Button>
              {!inCombat && (
                <Button variant="destructive" onClick={startTestCombat}>
                  Test Combat
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Character HUD */}
        {showSidebar && (
          <div className="absolute top-0 right-0 h-screen w-80 bg-gray-800 bg-opacity-80 text-white p-4 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">{character.name}</h2>
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span>HP</span>
                <span>{character.currentHp}/{character.maxHp}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-red-600 h-2.5 rounded-full" 
                  style={{ width: `${(character.currentHp / character.maxHp) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span>Force Points</span>
                <span>{character.currentForcePoints}/{character.maxForcePoints}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${(character.currentForcePoints / character.maxForcePoints) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Location</h3>
              <p>{currentLocation?.name || "Unknown"}</p>
              <p className="text-sm text-gray-400">{currentLocation?.description || ""}</p>
            </div>

              <Tabs defaultValue="quests">
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="quests">Quests</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="gm">GM Interface</TabsTrigger>
                </TabsList>
              
              <TabsContent value="quests">
                <h3 className="font-semibold mb-2">Active Quests</h3>
                <div className="space-y-2">
                  {campaign.quests?.filter(q => q.status === "active").map((quest, index) => (
                    <div key={index} className="bg-gray-700 p-2 rounded">
                      <div className="font-semibold">{quest.title}</div>
                      <div className="text-sm mt-1">{quest.description}</div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="inventory">
                <h3 className="font-semibold mb-2">Inventory</h3>
                <div className="space-y-1">
                  {character.equipment?.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item}</span>
                    </div>
                  ))}
            </div>
          </TabsContent>

          <TabsContent value="gm">
            <GMReportManager />
          </TabsContent>
        </Tabs>
      </div>
        )}

        {/* Combat UI */}
        {showCombat && <CombatTracker />}
      </KeyboardControls>
    </div>
  );
}
