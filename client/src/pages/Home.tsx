import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  
  // Fetch existing characters
  const { data: characters = [], isLoading: charactersLoading } = useQuery({
    queryKey: ["/api/characters"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/characters", undefined);
      return await res.json();
    },
  });
  
  // Fetch existing campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
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
      <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
        <div className="text-6xl font-bold mb-8 text-yellow-400">SW5E</div>
        <div className="text-2xl mb-12">A long time ago in a galaxy far, far away...</div>
        <div className="animate-pulse">Loading your adventure...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <header className="py-8 text-center">
          <h1 className="text-5xl font-bold text-yellow-400 mb-4">SW5E RPG Simulator</h1>
          <p className="text-xl text-gray-300">Forge your destiny in the galaxy far, far away</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <section>
            <h2 className="text-2xl font-semibold mb-6 text-yellow-300">Your Characters</h2>
            {charactersLoading ? (
              <div className="text-center p-8">Loading characters...</div>
            ) : characters.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {characters.map((character) => (
                  <Card key={character.id} className="bg-gray-800 border-gray-700">
                    <CardHeader>
                      <CardTitle>{character.name}</CardTitle>
                      <CardDescription>
                        Level {character.level} {character.species} {character.class}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <Link to={`/character/manage/${character.id}`}>
                        <Button>Manage Character</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-gray-800 border-gray-700 text-center p-6">
                <CardContent>
                  <p className="mb-4">You haven't created any characters yet.</p>
                  <Link to="/character/create">
                    <Button>Create Your First Character</Button>
                  </Link>
                </CardContent>
              </Card>
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
            <h2 className="text-2xl font-semibold mb-6 text-yellow-300">Your Campaigns</h2>
            {campaignsLoading ? (
              <div className="text-center p-8">Loading campaigns...</div>
            ) : campaigns.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} className="bg-gray-800 border-gray-700">
                    <CardHeader>
                      <CardTitle>{campaign.name}</CardTitle>
                      <CardDescription>{campaign.description}</CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-between">
                      <Link to={`/campaign/${campaign.id}`}>
                        <Button variant="outline">View</Button>
                      </Link>
                      <Link to={`/game/${campaign.id}`}>
                        <Button>Play</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-gray-800 border-gray-700 text-center p-6">
                <CardContent>
                  <p className="mb-4">You haven't created any campaigns yet.</p>
                  <p className="text-sm text-gray-400">Create a character first to generate a campaign</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
