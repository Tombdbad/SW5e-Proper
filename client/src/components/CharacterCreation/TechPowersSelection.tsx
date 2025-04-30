
import React, { useState, useEffect } from "react";
import { TECH_POWERS } from "../../lib/sw5e/techPowers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

interface TechPowersSelectionProps {
  form: any;
  availablePowers: number;
  maxPowerLevel: number;
}

export default function TechPowersSelection({
  form,
  availablePowers,
  maxPowerLevel,
}: TechPowersSelectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPowers, setSelectedPowers] = useState<string[]>([]);
  const [filteredPowers, setFilteredPowers] = useState(TECH_POWERS);

  // Get values from form
  const techPowers = form.watch("techPowers") || [];

  // Apply filters whenever dependencies change
  useEffect(() => {
    // Filter powers based on level and search term
    const filtered = TECH_POWERS.filter((power) => {
      // Filter by power level
      if (power.level > maxPowerLevel) return false;

      // Filter by search term
      if (searchTerm && !power.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      return true;
    });

    setFilteredPowers(filtered);
  }, [searchTerm, maxPowerLevel]);

  // Keep local state in sync with form
  useEffect(() => {
    setSelectedPowers(techPowers);
  }, [techPowers]);

  // Handle power selection/deselection
  const handlePowerToggle = (powerName: string) => {
    let updatedPowers: string[];
    
    if (selectedPowers.includes(powerName)) {
      // Remove power
      updatedPowers = selectedPowers.filter((p) => p !== powerName);
    } else {
      // Add power if we haven't reached the limit
      if (selectedPowers.length < availablePowers) {
        updatedPowers = [...selectedPowers, powerName];
      } else {
        // Already at the limit
        return;
      }
    }
    
    // Update form state
    form.setValue("techPowers", updatedPowers);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Selected: {selectedPowers.length}/{availablePowers}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Badge variant="outline">Tech</Badge>
          <Badge variant="outline">Max Level: {maxPowerLevel}</Badge>
        </div>
      </div>
      
      <div className="mb-4">
        <Label htmlFor="search-tech-powers">Search Powers</Label>
        <Input
          id="search-tech-powers"
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 border-gray-700"
        />
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPowers.map((power) => (
            <Card
              key={power.name}
              className={`hover:bg-gray-700/50 transition-colors cursor-pointer ${
                selectedPowers.includes(power.name) ? "border-yellow-500 bg-gray-700/50" : "border-gray-700"
              }`}
              onClick={() => handlePowerToggle(power.name)}
            >
              <CardHeader className="p-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedPowers.includes(power.name)}
                      onCheckedChange={() => handlePowerToggle(power.name)}
                      disabled={
                        selectedPowers.length >= availablePowers &&
                        !selectedPowers.includes(power.name)
                      }
                    />
                    <span>{power.name}</span>
                  </span>
                  <Badge variant="outline" className="bg-cyan-900/30 text-cyan-300">
                    {power.level > 0 ? `Level ${power.level}` : "Cantrip"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-gray-400">{power.description}</p>
                {power.category && (
                  <p className="text-xs mt-2">
                    <span className="text-gray-500">Category:</span>{" "}
                    <span className="text-cyan-400">{power.category}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          
          {filteredPowers.length === 0 && (
            <div className="col-span-2 text-center p-4 text-gray-500">
              No powers match your filters.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
