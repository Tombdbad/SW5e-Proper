
import React, { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { calculateModifier } from "../../lib/sw5e/rules";

interface ForcePowersSelectionProps {
  form: any;
  forcePowers: any[];
  maxPowerLevel: number;
  castingAbility: string;
}

export default function ForcePowersSelection({
  form,
  forcePowers,
  maxPowerLevel,
  castingAbility,
}: ForcePowersSelectionProps) {
  const { watch, setValue } = form;
  const abilities = watch("abilities");
  const selectedForcePowers = watch("forcePowers") || [];
  const level = watch("level") || 1;
  const forceAlignment = watch("forceAlignment") || "Universal";
  
  const [filteredPowers, setFilteredPowers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<number | "all">("all");
  const [filterAlignment, setFilterAlignment] = useState<string>("all");
  const [maxSelections, setMaxSelections] = useState(0);

  // Calculate casting ability modifier
  const abilityModifier = castingAbility ? 
    calculateModifier(abilities?.[castingAbility.toLowerCase()] || 10) : 0;

  // Calculate max powers known based on class level and ability modifier
  useEffect(() => {
    // Simplified calculation - customize based on your SW5E rules
    const maxPowers = level + abilityModifier;
    setMaxSelections(Math.max(1, maxPowers));
  }, [level, abilityModifier]);

  // Filter powers based on search and filters
  useEffect(() => {
    let filtered = forcePowers;
    
    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(power => 
        power.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        power.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Filter by power level
    if (filterLevel !== "all") {
      filtered = filtered.filter(power => power.level === filterLevel);
    }
    
    // Filter by alignment
    if (filterAlignment !== "all") {
      filtered = filtered.filter(power => 
        power.alignment === filterAlignment || 
        power.alignment === "Universal"
      );
    }
    
    // Filter by max power level based on character level
    filtered = filtered.filter(power => power.level <= maxPowerLevel);
    
    setFilteredPowers(filtered);
  }, [searchTerm, filterLevel, filterAlignment, forcePowers, maxPowerLevel]);

  // Handle power selection
  const togglePower = (power: any) => {
    const isSelected = selectedForcePowers.some((p: any) => p.id === power.id);
    
    if (isSelected) {
      // Remove power
      setValue(
        "forcePowers",
        selectedForcePowers.filter((p: any) => p.id !== power.id)
      );
    } else {
      // Check if max powers selected
      if (selectedForcePowers.length >= maxSelections) {
        alert(`You can only select up to ${maxSelections} Force powers at level ${level}.`);
        return;
      }
      
      // Add power
      setValue("forcePowers", [...selectedForcePowers, power]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 bg-opacity-50 p-4 rounded-md">
        <div className="text-yellow-200 mb-2">
          <span className="font-bold">Force Powers Known:</span> {selectedForcePowers.length}/{maxSelections}
        </div>
        <div className="text-yellow-200 mb-2">
          <span className="font-bold">Max Power Level:</span> {maxPowerLevel}
        </div>
        <div className="text-yellow-200">
          <span className="font-bold">Casting Ability:</span> {castingAbility} (Modifier: {abilityModifier >= 0 ? '+' : ''}{abilityModifier})
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Search and filters */}
        <div className="w-full md:w-1/3 space-y-3">
          <input
            type="text"
            placeholder="Search Force powers..."
            className="w-full bg-gray-800 bg-opacity-70 text-white p-2 rounded-md border border-gray-700 focus:border-yellow-400 focus:outline-none"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <div>
            <label className="block text-yellow-200 mb-1">Power Level</label>
            <select
              className="w-full bg-gray-800 bg-opacity-70 text-white p-2 rounded-md border border-gray-700 focus:border-yellow-400 focus:outline-none"
              onChange={(e) => setFilterLevel(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              value={filterLevel}
            >
              <option value="all">All Levels</option>
              {[...Array(maxPowerLevel)].map((_, i) => (
                <option key={i} value={i + 1}>
                  Level {i + 1}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-yellow-200 mb-1">Force Alignment</label>
            <select
              className="w-full bg-gray-800 bg-opacity-70 text-white p-2 rounded-md border border-gray-700 focus:border-yellow-400 focus:outline-none"
              onChange={(e) => setFilterAlignment(e.target.value)}
              value={filterAlignment}
            >
              <option value="all">All Alignments</option>
              <option value="Light">Light Side</option>
              <option value="Dark">Dark Side</option>
              <option value="Universal">Universal</option>
            </select>
          </div>
          
          {/* Selected Powers List */}
          <div className="mt-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">Selected Powers:</h3>
            {selectedForcePowers.length === 0 ? (
              <p className="text-gray-400 italic">No Force powers selected</p>
            ) : (
              <ul className="space-y-1">
                {selectedForcePowers.map((power: any) => (
                  <li key={power.id} className="flex justify-between items-center bg-gray-700 bg-opacity-50 p-2 rounded">
                    <span className="text-white">
                      {power.name} <span className="text-xs text-gray-400">(Level {power.level})</span>
                    </span>
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 focus:outline-none"
                      onClick={() => togglePower(power)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        {/* Powers list */}
        <div className="w-full md:w-2/3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-2">
            {filteredPowers.length === 0 ? (
              <p className="text-gray-400 italic col-span-2 text-center">No Force powers match your filters</p>
            ) : (
              filteredPowers.map((power) => {
                const isSelected = selectedForcePowers.some((p: any) => p.id === power.id);
                return (
                  <div
                    key={power.id}
                    className={`border rounded-md p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-yellow-400 bg-yellow-900 bg-opacity-30"
                        : "border-gray-700 bg-gray-800 bg-opacity-50 hover:bg-gray-700"
                    }`}
                    onClick={() => togglePower(power)}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="text-yellow-400 font-medium">{power.name}</h4>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        power.alignment === "Light" ? "bg-blue-900 text-blue-200" :
                        power.alignment === "Dark" ? "bg-red-900 text-red-200" :
                        "bg-gray-700 text-gray-300"
                      }`}>
                        {power.alignment}
                      </span>
                    </div>
                    <div className="text-gray-400 text-sm mb-2">Level {power.level}</div>
                    <p className="text-gray-300 text-sm line-clamp-3">{power.description}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
