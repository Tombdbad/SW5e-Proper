
import React, { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { LightsaberLoader } from '@/components/ui/lightsaber-loader';
import { HologramLoader } from '@/components/ui/hologram-loader';
import { AsyncButton } from '@/components/ui/async-button';
import { Button } from '@/components/ui/button';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { useLoading } from '@/hooks/useLoading';

export default function LoadingDemo() {
  const [progress, setProgress] = useState(45);
  const [sectionLoading, setSectionLoading] = useState(false);
  const { isLoading, startLoading, stopLoading } = useLoading();
  
  const simulateAsyncOperation = async () => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 2000);
    });
  };
  
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-yellow-400 mb-8">SW5E Loading Components</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Core Loading Components */}
        <TranslucentPane className="p-6">
          <h2 className="text-xl text-yellow-400 mb-4">Core Loading Components</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-lg mb-2">Spinners</h3>
              <div className="flex items-center gap-4">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg mb-2">Progress Bars</h3>
              <div className="space-y-4">
                <ProgressBar value={progress} max={100} showPercentage />
                <ProgressBar value={progress} max={100} variant="lightsaber" />
                <div className="flex items-center gap-4">
                  <Button onClick={() => setProgress(Math.max(0, progress - 10))}>-10%</Button>
                  <Button onClick={() => setProgress(Math.min(100, progress + 10))}>+10%</Button>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg mb-2">Skeletons</h3>
              <div className="space-y-2">
                <Skeleton variant="text" className="w-3/4" />
                <Skeleton variant="text" className="w-full" />
                <div className="flex gap-2 mt-4">
                  <Skeleton variant="circle" width={50} height={50} />
                  <div className="space-y-2 flex-1">
                    <Skeleton variant="text" />
                    <Skeleton variant="text" className="w-3/4" />
                  </div>
                </div>
                <Skeleton variant="rect" height={100} className="mt-4" />
              </div>
            </div>
          </div>
        </TranslucentPane>
        
        {/* Star Wars Themed Components */}
        <TranslucentPane className="p-6">
          <h2 className="text-xl text-yellow-400 mb-4">Star Wars Themed Loaders</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-lg mb-2">Lightsaber Loaders</h3>
              <div className="space-y-4">
                <LightsaberLoader color="blue" />
                <LightsaberLoader color="green" />
                <LightsaberLoader color="red" />
                <LightsaberLoader color="purple" />
                <LightsaberLoader color="yellow" />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg mb-2">Hologram Loader</h3>
              <div className="flex items-center justify-center py-6">
                <HologramLoader size="md" />
              </div>
            </div>
          </div>
        </TranslucentPane>
        
        {/* Loading Overlays and Integration */}
        <TranslucentPane className="p-6">
          <h2 className="text-xl text-yellow-400 mb-4">Loading Overlays</h2>
          
          <div className="space-y-6">
            <div>
              <Button 
                onClick={() => {
                  setSectionLoading(true);
                  setTimeout(() => setSectionLoading(false), 3000);
                }}
                className="mb-4"
              >
                Toggle Section Loading
              </Button>
              
              <LoadingOverlay isLoading={sectionLoading} text="Loading content...">
                <div className="border border-gray-700 p-4 rounded-md h-40">
                  <p>This content will be obscured when loading.</p>
                  <p className="mt-2">Click the button above to see the effect.</p>
                </div>
              </LoadingOverlay>
            </div>
            
            <div>
              <h3 className="text-lg mb-2">Transparent Overlay</h3>
              
              <Button 
                onClick={() => {
                  startLoading();
                  setTimeout(() => stopLoading(), 3000);
                }}
                className="mb-4"
              >
                Toggle Transparent Loading
              </Button>
              
              <LoadingOverlay isLoading={isLoading} text="Processing..." transparent>
                <div className="border border-gray-700 p-4 rounded-md h-40">
                  <p>This content will be blurred when loading.</p>
                  <p className="mt-2">Click the button above to see the effect.</p>
                </div>
              </LoadingOverlay>
            </div>
          </div>
        </TranslucentPane>
        
        {/* Async Buttons */}
        <TranslucentPane className="p-6">
          <h2 className="text-xl text-yellow-400 mb-4">Async Buttons</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg mb-2">Standard Async Button</h3>
              <AsyncButton
                onAsyncClick={simulateAsyncOperation}
                loadingText="Processing..."
                successText="Success!"
                errorText="Error!"
                className="w-full"
              >
                Click to Start Operation
              </AsyncButton>
            </div>
            
            <div>
              <h3 className="text-lg mb-2">Async Button Variants</h3>
              <div className="grid grid-cols-2 gap-2">
                <AsyncButton
                  onAsyncClick={simulateAsyncOperation}
                  loadingText="Loading..."
                  variant="outline"
                >
                  Outline
                </AsyncButton>
                
                <AsyncButton
                  onAsyncClick={simulateAsyncOperation}
                  loadingText="Loading..."
                  variant="secondary"
                >
                  Secondary
                </AsyncButton>
                
                <AsyncButton
                  onAsyncClick={simulateAsyncOperation}
                  loadingText="Loading..."
                  variant="ghost"
                >
                  Ghost
                </AsyncButton>
                
                <AsyncButton
                  onAsyncClick={async () => {
                    await simulateAsyncOperation();
                    throw new Error("Simulated error");
                  }}
                  loadingText="Loading..."
                  errorText="Failed!"
                >
                  With Error
                </AsyncButton>
              </div>
            </div>
          </div>
        </TranslucentPane>
      </div>
    </div>
  );
}
