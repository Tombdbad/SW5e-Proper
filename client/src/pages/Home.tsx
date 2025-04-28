import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { Character, Campaign } from "../../../shared/schema";

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  
  // Fetch existing characters
  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/characters", undefined);
      return await res.json();
    },
  });
  
  // Fetch existing campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns", undefined);
      return await res.json();
    },
  });
  
  // Hide intro after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (showIntro) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <div className="text-6xl font-bold mb-8 text-yellow-400">SW5E</div>
        <div className="text-2xl mb-12">A long time ago in a galaxy far, far away...</div>
        <div className="animate-pulse">Loading your adventure...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <TranslucentPane 
          className="mb-8 py-8 text-center" 
          variant="dark" 
          opacity="low"
          blurStrength="lg"
        >
          <h1 className="text-5xl font-bold text-yellow-400 mb-4">SW5E RPG Simulator</h1>
          <p className="text-xl text-gray-300">Forge your destiny in the galaxy far, far away</p>
        </TranslucentPane>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <section>
            <TranslucentPane variant="accent" opacity="medium" className="mb-6">
              <h2 className="text-2xl font-semibold text-yellow-300">Your Characters</h2>
            </TranslucentPane>
            
            {charactersLoading ? (
              <TranslucentPane className="text-center p-4">
                Loading characters...
              </TranslucentPane>
            ) : characters.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {characters.map((character: Character) => (
                  <TranslucentPane key={character.id} opacity="medium" blurStrength="md">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold">{character.name}</h3>
                      <p className="text-gray-300">
                        Level {character.level} {character.species} {character.class}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Link to={`/character/manage/${character.id}`}>
                        <Button>Manage Character</Button>
                      </Link>
                    </div>
                  </TranslucentPane>
                ))}
              </div>
            ) : (
              <TranslucentPane className="text-center p-6">
                <p className="mb-4">You haven't created any characters yet.</p>
                <Link to="/character/create">
                  <Button>Create Your First Character</Button>
                </Link>
              </TranslucentPane>
            )}
            <div className="mt-6 text-center">
              <Link to="/character/create">
                <Button variant="outline" className="border-yellow-400 text-yellow-400">
                  Create New Character
                </Button>
              </Link>
            </div>
          </section>
          
          <section>
            <TranslucentPane variant="accent" opacity="medium" className="mb-6">
              <h2 className="text-2xl font-semibold text-yellow-300">Your Campaigns</h2>
            </TranslucentPane>
            
            {campaignsLoading ? (
              <TranslucentPane className="text-center p-4">
                Loading campaigns...
              </TranslucentPane>
            ) : campaigns.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {campaigns.map((campaign: Campaign) => (
                  <TranslucentPane key={campaign.id} opacity="medium" blurStrength="md">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold">{campaign.name}</h3>
                      <p className="text-gray-300">{campaign.description}</p>
                    </div>
                    <div className="flex justify-between">
                      <Link to={`/campaign/${campaign.id}`}>
                        <Button variant="outline">View</Button>
                      </Link>
                      <Link to={`/game/${campaign.id}`}>
                        <Button>Play</Button>
                      </Link>
                    </div>
                  </TranslucentPane>
                ))}
              </div>
            ) : (
              <TranslucentPane className="text-center p-6">
                <p className="mb-4">You haven't created any campaigns yet.</p>
                <p className="text-sm text-gray-400">Create a character first to generate a campaign</p>
              </TranslucentPane>
            )}
          </section>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <TranslucentPane className="p-6" opacity="medium">
            <h3 className="text-xl font-bold mb-3 text-cyan-400">Galactic Map</h3>
            <p className="mb-4 text-gray-300">
              Explore the Star Wars galaxy with an interactive 3D map of systems and planets.
            </p>
            <Link to="/map/galaxy">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                Open Galaxy Map
              </Button>
            </Link>
          </TranslucentPane>
          
          <TranslucentPane className="p-6" opacity="medium">
            <h3 className="text-xl font-bold mb-3 text-yellow-400">Dice Roller</h3>
            <p className="mb-4 text-gray-300">
              Use the built-in dice roller for your skill checks and combat rolls.
            </p>
            <Button className="w-full" variant="outline" disabled>
              Coming Soon
            </Button>
          </TranslucentPane>
          
          <TranslucentPane className="p-6" opacity="medium">
            <h3 className="text-xl font-bold mb-3 text-red-400">Rulebook</h3>
            <p className="mb-4 text-gray-300">
              Access the SW5E rulebook for reference during your game sessions.
            </p>
            <Button className="w-full" variant="outline" disabled>
              Coming Soon
            </Button>
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
}
