import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Campaign } from '../../../shared/schema';
import { motion } from 'framer-motion';
import { starSystems } from '@/lib/sw5e/locations';

// Map for translating era values to human-readable text
const eraMap: Record<string, string> = {
  'high-republic': 'High Republic',
  'fall-republic': 'Fall of the Republic',
  'imperial': 'Imperial Era',
  'new-republic': 'New Republic',
  'first-order': 'First Order/Resistance'
};

// Map for translating threat values to human-readable text
const threatMap: Record<string, string> = {
  'empire': 'Galactic Empire',
  'sith': 'Sith Lords',
  'criminals': 'Criminal Syndicates',
  'separatists': 'Separatists',
  'first-order': 'First Order',
  'custom': 'Custom Threat'
};

interface CampaignCardProps {
  campaign: Campaign;
  onDelete?: (id: number) => void;
}

export default function CampaignCard({ campaign, onDelete }: CampaignCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const handleView = () => {
    navigate(`/campaigns/${campaign.id}`);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    if (window.confirm(`Are you sure you want to delete the campaign "${campaign.name}"?`)) {
      setIsDeleting(true);
      try {
        onDelete(campaign.id);
      } catch (error) {
        console.error('Error deleting campaign:', error);
        setIsDeleting(false);
      }
    }
  };

  // Find the corresponding star system for the location
  const locationSystem = starSystems.find(system => system.id === campaign.location);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className="h-full overflow-hidden bg-gray-800/70 border-gray-700 hover:border-yellow-600 transition-all">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl text-yellow-400">{campaign.name}</CardTitle>
            <Badge variant="outline" className="bg-gray-700 text-yellow-300">
              {eraMap[campaign.era as keyof typeof eraMap] || campaign.era}
            </Badge>
          </div>
          <CardDescription className="line-clamp-1 text-gray-300">
            {locationSystem?.name || campaign.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <p className="text-sm text-gray-300 line-clamp-3">
            {campaign.description}
          </p>
          <div className="mt-4">
            <Badge variant="secondary" className="mr-2 bg-gray-700">
              {threatMap[campaign.threat as keyof typeof threatMap] || campaign.threat}
            </Badge>
            {campaign.tags && campaign.tags.map((tag: string, i: number) => (
              <Badge key={i} variant="outline" className="mr-2">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between pt-2">
          <Button 
            variant="link" 
            onClick={handleView}
            className="text-blue-400 hover:text-blue-300"
          >
            View Campaign
          </Button>
          {onDelete && (
            <Button 
              variant="ghost" 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}