import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import CampaignGenerator from '../components/Campaign/CampaignGenerator';
import CampaignManager from '../components/Campaign/CampaignManager';
import TranslucentPane from '../components/ui/TranslucentPane';

export default function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showGenerator, setShowGenerator] = useState(false);

  // Fetch campaign
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${id}`],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiRequest('GET', `/api/campaigns/${id}`);
      return await res.json();
    },
    enabled: !!id && id !== 'create'
  });

  // Fetch character: the campaign's own, else ?characterId=, else the first one (create mode)
  const [searchParams] = useSearchParams();
  const paramId = searchParams.get('characterId');
  const wantedId: number | undefined =
    (campaign as any)?.characterId ?? (paramId ? Number(paramId) : undefined);
  const { data: character, isLoading: characterLoading } = useQuery({
    queryKey: ['/api/characters', 'for-campaign', wantedId ?? 'first'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/characters');
      const characters = await res.json();
      return (wantedId !== undefined
        ? characters.find((c: any) => c.id === wantedId)
        : characters[0]) || null;
    },
    enabled: id === 'create' || !!campaign
  });

  // Save campaign mutation
  const saveCampaign = useMutation({
    mutationFn: async (campaignData: any) => {
      if (id && id !== 'create') {
        // Update existing campaign
        return apiRequest('PUT', `/api/campaigns/${id}`, campaignData);
      } else {
        // Create new campaign, with a generated world to play in
        const { worldOptions, ...fields } = campaignData;
        const generated = await (await apiRequest('POST', '/api/world/generate', { options: worldOptions ?? {} })).json();
        return apiRequest('POST', '/api/campaigns', {
          ...fields,
          galaxyMap: generated.world,
          currentLocation: generated.world.startId,
          // Quests the world can keep score of replace the generator's free-text ones
          quests: generated.quests?.length ? generated.quests : fields.quests,
        });
      }
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${data.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setShowGenerator(false);
      navigate(`/campaigns/${data.id}`);
    }
  });

  const handleSaveCampaign = (campaignData: any) => saveCampaign.mutateAsync(campaignData);

  // Show the generator in 'create' mode, the saved campaign otherwise
  useEffect(() => {
    setShowGenerator(id === 'create');
  }, [id]);

  if (!id && !campaign) {
    return (
      <div className="min-h-screen p-6">
        <TranslucentPane className="p-6 text-center">
          <h2 className="text-2xl font-bold text-yellow-400 mb-4">Select a Campaign</h2>
          <p className="text-gray-300 mb-4">
            Select an existing campaign or create a new one.
          </p>
          <button
            onClick={() => navigate('/campaigns/create')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create New Campaign
          </button>
        </TranslucentPane>
      </div>
    );
  }

  if (campaignLoading || (characterLoading && !showGenerator)) {
    return (
      <div className="min-h-screen p-6">
        <TranslucentPane className="p-6 text-center">
          <h2 className="text-2xl font-bold text-yellow-400 mb-4">Loading...</h2>
        </TranslucentPane>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {showGenerator ? (
        character ? (
          <CampaignGenerator 
            character={character} 
            onSave={handleSaveCampaign} 
          />
        ) : (
          <TranslucentPane className="p-6 text-center">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">Select a Character</h2>
            <p className="text-gray-300 mb-4">
              You need to select a character before creating a campaign.
            </p>
            <button
              onClick={() => navigate('/characters/create')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Character
            </button>
          </TranslucentPane>
        )
      ) : (
        campaign && (
          <>
            <div className="flex justify-between mb-4">
              <Link to="/" className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                Home
              </Link>
              <Link to={`/game/${campaign.id}`} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                Play
              </Link>
            </div>
            <CampaignManager campaign={campaign} character={character} onSave={handleSaveCampaign} />
          </>
        )
      )}
    </div>
  );
}