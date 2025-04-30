
import React, { useState, useEffect } from "react";
import { FORCE_POWERS } from "../../lib/sw5e/forcePowers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

interface ForcePowersSelectionProps {
  form: any;
  availablePowers: number;
  maxPowerLevel: number;
  alignment: string;
}

export default function ForcePowersSelection({
  form,
  availablePowers,
  maxPowerLevel,
  alignment,
}: ForcePowersSelectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPowers, setSelectedPowers] = useState<string[]>([]);
  const [filteredPowers, setFilteredPowers] = useState(FORCE_POWERS);

  // Get values from form
  const forcePowers = form.watch("forcePowers") || [];

  // Apply filters whenever dependencies change
  useEffect(() => {
    // Filter powers based on alignment, level, and search term
    const filtered = FORCE_POWERS.filter((power) => {
      // Filter by power level
      if (power.level > maxPowerLevel) return false;

      // Filter by alignment (if alignment filter is active)
      if (alignment !== "Universal") {
        if (power.alignment && !power.alignment.includes(alignment) && !power.alignment.includes("Universal")) {
          return false;
        }
      }

      // Filter by search term
      if (searchTerm && !power.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      return true;
    });

    setFilteredPowers(filtered);
  }, [searchTerm, maxPowerLevel, alignment]);

  // Keep local state in sync with form
  useEffect(() => {
    setSelectedPowers(forcePowers);
  }, [forcePowers]);

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
    form.setValue("forcePowers", updatedPowers);
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
          <Badge variant="outline">{alignment} Side</Badge>
          <Badge variant="outline">Max Level: {maxPowerLevel}</Badge>
        </div>
      </div>
      
      <div className="mb-4">
        <Label htmlFor="search-force-powers">Search Powers</Label>
        <Input
          id="search-force-powers"
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
                  <Badge
                    variant="outline"
                    className={
                      power.alignment?.includes("Light")
                        ? "bg-blue-900/30 text-blue-300"
                        : power.alignment?.includes("Dark")
                        ? "bg-red-900/30 text-red-300"
                        : "bg-gray-700/30"
                    }
                  >
                    {power.level > 0 ? `Level ${power.level}` : "Cantrip"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-gray-400">{power.description}</p>
                {power.alignment && (
                  <p className="text-xs mt-2">
                    <span className="text-gray-500">Alignment:</span>{" "}
                    <span
                      className={
                        power.alignment.includes("Light")
                          ? "text-blue-400"
                          : power.alignment.includes("Dark")
                          ? "text-red-400"
                          : "text-gray-400"
                      }
                    >
                      {power.alignment}
                    </span>
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
