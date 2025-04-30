
    import React, { useState, useEffect } from "react";
    import { useFormContext, useWatch } from "react-hook-form";
    import ForcePowersSelection from "./ForcePowersSelection";
    import TechPowersSelection from "./TechPowersSelection";
    import { Alert } from "@/components/ui/alert";
    import { Badge } from "@/components/ui/badge";
    import { Info } from "lucide-react";
    import TranslucentPane from "@/components/ui/TranslucentPane";
    import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
    import { ScrollArea } from "@/components/ui/scroll-area";
    import { forcePowers } from "@/lib/sw5e/forcePowers"; 
    import { techPowers } from "@/lib/sw5e/techPowers";

    export default function PowersSelection() {
      const { watch, setValue, getValues } = useFormContext();
      const selectedClass = watch("class");
      const characterLevel = watch("level") || 1;

      const [activeTab, setActiveTab] = useState<string>("force");
      const [hasForceCasting, setHasForceCasting] = useState<boolean>(false);
      const [hasTechCasting, setHasTechCasting] = useState<boolean>(false);
      const [maxPowerLevel, setMaxPowerLevel] = useState<number>(0);
      const [maxPowerPoints, setMaxPowerPoints] = useState<number>(0);

      // Effect to determine what power types the character can use based on class
      useEffect(() => {
        let canUseForcePowers = false;
        let canUseTechPowers = false;
        let powerLevel = Math.min(5, Math.ceil(characterLevel / 4));
        let powerPoints = characterLevel + 1;

        // These are examples - update with your actual class data
        const forceClasses = ["consular", "guardian", "sentinel"];
        const techClasses = ["engineer", "scholar", "scout"];

        // Check if the selected class can use Force powers
        if (forceClasses.includes(selectedClass)) {
          canUseForcePowers = true;
        }

        // Check if the selected class can use Tech powers
        if (techClasses.includes(selectedClass)) {
          canUseTechPowers = true;
        }

        setHasForceCasting(canUseForcePowers);
        setHasTechCasting(canUseTechPowers);
        setMaxPowerLevel(powerLevel);
        setMaxPowerPoints(powerPoints);

        // Set initial active tab based on class capabilities
        if (canUseForcePowers && !canUseTechPowers) {
          setActiveTab("force");
        } else if (canUseTechPowers && !canUseForcePowers) {
          setActiveTab("tech");
        }
      }, [selectedClass, characterLevel]);

      // If character can't use any powers, show message
  if (!hasForceCasting && !hasTechCasting) {
    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4 mr-2" />
          Your character class does not have access to Force or Tech powers.
        </Alert>
        <p className="text-gray-400">
          Select a Force user (like Consular or Guardian) or Tech user (like Engineer or Scholar) 
          to access powers.
        </p>
      </div>
    );
  }

  return (
        <ScrollArea className="h-[75vh] pr-2 overflow-y-auto">
          <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-yellow-400">Power Selection</h2>
          <div className="flex space-x-2">
            <Badge variant="outline" className="bg-blue-900/30">
              Power Points: {maxPowerPoints}
            </Badge>
            <Badge variant="outline" className="bg-purple-900/30">
              Max Power Level: {maxPowerLevel}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="force" 
              disabled={!hasForceCasting}
              className={!hasForceCasting ? "opacity-50 cursor-not-allowed" : ""}
            >
              Force Powers
            </TabsTrigger>
            <TabsTrigger 
              value="tech" 
              disabled={!hasTechCasting}
              className={!hasTechCasting ? "opacity-50 cursor-not-allowed" : ""}
            >
              Tech Powers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="force">
            <TranslucentPane>
              {hasForceCasting && (
                <ForcePowersSelection 
                  form={useFormContext()}
                  powers={forcePowers}
                  maxPowerLevel={maxPowerLevel}
                  maxPowerPoints={maxPowerPoints}
                  alignment={watch("alignment") || "Neutral"}
                />
              )}
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="tech">
            <TranslucentPane>
              {hasTechCasting && (
                <TechPowersSelection 
                  form={useFormContext()}
                  powers={techPowers}
                  maxPowerLevel={maxPowerLevel}
                  maxPowerPoints={maxPowerPoints}
                />
              )}
            </TranslucentPane>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}