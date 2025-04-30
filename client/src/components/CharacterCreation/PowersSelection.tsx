
import React, { useState, useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLASSES } from "@/lib/sw5e/classes";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InfoCircle } from "lucide-react";
import TranslucentPane from "@/components/ui/TranslucentPane";

interface PowersSelectionProps {
  form: any;
  forcePowers: any[];
  techPowers: any[];
  getSelectedClass: () => any;
}

export default function PowersSelection({
  form,
  forcePowers,
  techPowers,
  getSelectedClass,
}: PowersSelectionProps) {
  const { control, setValue, getValues } = form;
  const selectedClass = useWatch({
    control,
    name: "class",
  });
  const selectedMulticlass = useWatch({
    control,
    name: "multiclass",
  });
  
  const [activeTab, setActiveTab] = useState<string>("force");
  const [hasForceCasting, setHasForceCasting] = useState<boolean>(false);
  const [hasTechCasting, setHasTechCasting] = useState<boolean>(false);
  const [maxPowerLevel, setMaxPowerLevel] = useState<number>(0);
  const [maxPowerPoints, setMaxPowerPoints] = useState<number>(0);
  
  // Effect to determine what power types the character can use based on class
  useEffect(() => {
    let canUseForcePowers = false;
    let canUseTechPowers = false;
    let powerLevel = 0;
    let powerPoints = 0;
    
    // Check main class
    const mainClass = CLASSES.find(c => c.id === selectedClass);
    if (mainClass?.spellcasting) {
      if (mainClass.spellcasting.type === "Force") {
        canUseForcePowers = true;
        powerLevel = Math.max(powerLevel, mainClass.spellcasting.maxLevel || 0);
        powerPoints += mainClass.spellcasting.points || 0;
      } else if (mainClass.spellcasting.type === "Tech") {
        canUseTechPowers = true;
        powerLevel = Math.max(powerLevel, mainClass.spellcasting.maxLevel || 0);
        powerPoints += mainClass.spellcasting.points || 0;
      }
    }
    
    // Check multiclass if any
    if (selectedMulticlass && selectedMulticlass.length > 0) {
      for (const multiClass of selectedMulticlass) {
        const secondaryClass = CLASSES.find(c => c.id === multiClass.class);
        if (secondaryClass?.spellcasting) {
          if (secondaryClass.spellcasting.type === "Force") {
            canUseForcePowers = true;
            powerLevel = Math.max(powerLevel, secondaryClass.spellcasting.maxLevel || 0);
            powerPoints += secondaryClass.spellcasting.points || 0;
          } else if (secondaryClass.spellcasting.type === "Tech") {
            canUseTechPowers = true;
            powerLevel = Math.max(powerLevel, secondaryClass.spellcasting.maxLevel || 0);
            powerPoints += secondaryClass.spellcasting.points || 0;
          }
        }
      }
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
    
    // Update form values
    setValue("maxPowerLevel", powerLevel);
    setValue("powerPoints", powerPoints);
  }, [selectedClass, selectedMulticlass, setValue]);
  
  // If character can't use any powers, show message
  if (!hasForceCasting && !hasTechCasting) {
    return (
      <div className="space-y-4">
        <Alert>
          <InfoCircle className="h-4 w-4 mr-2" />
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
            <ForcePowersSelection 
              form={form} 
              powers={forcePowers} 
              maxPowerLevel={maxPowerLevel}
              maxPowerPoints={maxPowerPoints}
            />
          </TranslucentPane>
        </TabsContent>
        
        <TabsContent value="tech">
          <TranslucentPane>
            <TechPowersSelection 
              form={form} 
              powers={techPowers}
              maxPowerLevel={maxPowerLevel}
              maxPowerPoints={maxPowerPoints}
            />
          </TranslucentPane>
        </TabsContent>
      </Tabs>
    </div>
  );
}
