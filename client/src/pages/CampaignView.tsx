import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/utils'; // Assuming this import is correct based on context
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
    enabled: !!id
  });

  // Fetch character
  const { data: character, isLoading: characterLoading } = useQuery({
    queryKey: ['/api/characters'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/characters');
      const characters = await res.json();
      return characters.find((c: any) => campaign && c.id === campaign.characterId) || null;
    },
    enabled: !!campaign
  });

  // Save campaign mutation
  const saveCampaign = useMutation({
    mutationFn: async (campaignData: any) => {
      if (id) {
        // Update existing campaign
        return apiRequest('PUT', `/api/campaigns/${id}`, campaignData);
      } else {
        // Create new campaign
        return apiRequest('POST', '/api/campaigns', campaignData);
      }
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${data.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      navigate(`/campaign/${data.id}`);
    }
  });

  const handleSaveCampaign = (campaignData: any) => {
    saveCampaign.mutate(campaignData);
  };

  // Show generator if no campaign exists or we're in 'create' mode
  useEffect(() => {
    if (id === 'create' || !campaign) {
      setShowGenerator(true);
    }
  }, [id, campaign]);

  if (!id && !campaign) {
    return (
      <div className="min-h-screen p-6">
        <TranslucentPane className="p-6 text-center">
          <h2 className="text-2xl font-bold text-yellow-400 mb-4">Select a Campaign</h2>
          <p className="text-gray-300 mb-4">
            Select an existing campaign or create a new one.
          </p>
          <button
            onClick={() => navigate('/campaign/create')}
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
              onClick={() => navigate('/character/create')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Character
            </button>
          </TranslucentPane>
        )
      ) : (
        campaign && (
          <CampaignManager 
            campaign={campaign} 
            character={character}
            onSave={handleSaveCampaign}
            onGenerateContent={() => setShowGenerator(true)}
          />
        )
      )}
    </div>
  );
}