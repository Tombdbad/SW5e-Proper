
import React, { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert } from "../ui/alert";

interface TechPowersSelectionProps {
  maxPowerLevel: number;
  maxPowerPoints: number;
}

export default function TechPowersSelection({ 
  form, 
  powers,
  maxPowerLevel,
  maxPowerPoints
}: TechPowersSelectionProps) {
  const { control, setValue, watch, getValues } = form;
  const [filter, setFilter] = useState("");
  const [powerLevel, setPowerLevel] = useState<number | string>("all");
  const [category, setCategory] = useState<string>("all");
  const [selectedPowers, setSelectedPowers] = useState<string[]>(watch("techPowers") || []);
  const [pointsUsed, setPointsUsed] = useState(0);
  
  // Calculate points used whenever selected powers change
  useEffect(() => {
    let totalPoints = 0;
    selectedPowers.forEach(powerId => {
      const power = powers.find(p => p.id === powerId);
      if (power) {
        totalPoints += power.cost || power.level || 0;
      }
    });
    setPointsUsed(totalPoints);
  }, [selectedPowers, powers]);
  
  // Initialize from form values
  useEffect(() => {
    const formPowers = watch("techPowers") || [];
    setSelectedPowers(formPowers);
  }, [watch]);
  
  // Filter powers based on user selections
  const filteredPowers = powers.filter(power => {
    // Filter by search term
    const matchesSearch = power.name.toLowerCase().includes(filter.toLowerCase()) ||
                         power.description.toLowerCase().includes(filter.toLowerCase());
    
    // Filter by power level
    const matchesLevel = powerLevel === "all" || power.level === Number(powerLevel);
    
    // Filter by category
    const matchesCategory = category === "all" || power.category === category;
    
    // Filter by max power level available to character
    const isInRange = power.level <= maxPowerLevel;
    
    return matchesSearch && matchesLevel && matchesCategory && isInRange;
  });
  
  // Group powers by level for display
  const powersByLevel: { [key: number]: any[] } = {};
  filteredPowers.forEach(power => {
    if (!powersByLevel[power.level]) {
      powersByLevel[power.level] = [];
    }
    powersByLevel[power.level].push(power);
  });
  
  // Handle power selection/deselection
  const togglePower = (powerId: string) => {
    let updated: string[];
    
    if (selectedPowers.includes(powerId)) {
      // Deselect power
      updated = selectedPowers.filter(id => id !== powerId);
    } else {
      // Check if adding would exceed available points
      const power = powers.find(p => p.id === powerId);
      const newTotal = pointsUsed + (power?.cost || power?.level || 0);
      
      if (newTotal > maxPowerPoints) {
        alert("You don't have enough power points to select this power.");
        return;
      }
      
      // Select power
      updated = [...selectedPowers, powerId];
    }
    
    setSelectedPowers(updated);
    setValue("techPowers", updated);
  };
  
  // Get unique categories for filter
  const categories = Array.from(new Set(powers.map(p => p.category))).filter(Boolean);
  
  // Sort levels for display
  const sortedLevels = Object.keys(powersByLevel)
    .map(Number)
    .sort((a, b) => a - b);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-yellow-400">Tech Powers</h3>
        <Badge variant="outline" className="bg-blue-900/30">
          Points: {pointsUsed} / {maxPowerPoints}
        </Badge>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search powers..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Select value={String(powerLevel)} onValueChange={setPowerLevel}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              {[...Array(maxPowerLevel || 5)].map((_, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  Level {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {filteredPowers.length === 0 ? (
        <Alert>No Tech powers match your filters.</Alert>
      ) : (
        <ScrollArea className="h-[400px] pr-4">
          {sortedLevels.map(level => (
            <div key={level} className="mb-6">
              <h4 className="text-md font-medium mb-2">Level {level}</h4>
              <Separator className="mb-2" />
              
              <div className="space-y-3">
                {powersByLevel[level].map(power => (
                  <div 
                    key={power.id} 
                    className={`
                      p-3 rounded-md transition-colors
                      ${selectedPowers.includes(power.id) 
                        ? 'bg-blue-900/20 border border-blue-500/40' 
                        : 'bg-gray-800/30 hover:bg-gray-700/30 border border-gray-700/40'}
                    `}
                  >
                    <div className="flex items-start">
                      <Checkbox
                        id={`tech-power-${power.id}`}
                        checked={selectedPowers.includes(power.id)}
                        onCheckedChange={() => togglePower(power.id)}
                        className="mt-1"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex justify-between">
                          <Label
                            htmlFor={`tech-power-${power.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {power.name}
                          </Label>
                          <div className="flex space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {power.category || "General"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {power.cost || power.level} Points
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {power.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </ScrollArea>
      )}
    </div>
  );
}
