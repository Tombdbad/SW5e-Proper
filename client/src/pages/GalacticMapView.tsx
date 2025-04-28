import React from 'react';
import { Link } from 'react-router-dom';
import GalacticMap3D from '@/components/Map/GalacticMap3D';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { Button } from '@/components/ui/button';

export default function GalacticMapView() {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <TranslucentPane className="py-4 px-6">
            <h1 className="text-3xl font-bold text-yellow-400">Galactic Map</h1>
            <p className="text-gray-300">Navigate the galaxy to discover systems and planets</p>
          </TranslucentPane>
          
          <Link to="/">
            <Button variant="outline" className="border-yellow-400 text-yellow-400">
              Return to Dashboard
            </Button>
          </Link>
        </div>
        
        <TranslucentPane className="mb-6" opacity="low">
          <div className="p-4">
            <p className="mb-4">
              This interactive map allows you to explore the galaxy, discover star systems, and learn about planets.
            </p>
            <ul className="list-disc list-inside text-sm mb-4">
              <li>Click on a star to zoom in and view its planetary system</li>
              <li>Click on a planet to examine it in detail</li>
              <li>Use the Zoom Out button to return to previous views</li>
              <li>Drag to rotate the view, scroll to zoom in and out</li>
            </ul>
          </div>
        </TranslucentPane>
        
        <TranslucentPane className="p-4" opacity="medium">
          <GalacticMap3D />
        </TranslucentPane>
        
        <div className="mt-8 flex justify-end">
          <Link to="/">
            <Button variant="outline" className="border-yellow-400 text-yellow-400">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}