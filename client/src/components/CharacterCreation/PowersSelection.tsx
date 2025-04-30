
import React, { useEffect, useState } from "react";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";
import { Card, CardContent } from "../ui/card";
import { Alert } from "../ui/alert";

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
  const [error, setError] = useState<string | null>(null);
  const selectedClass = getSelectedClass();
  const selectedClassName = selectedClass?.name || "";
  
  // Check for spellcasting capability
  const hasForcePowers = selectedClass?.spellcasting?.type === "Force";
  const hasTechPowers = selectedClass?.spellcasting?.type === "Tech";
  
  // Get important values from the form
  const characterLevel = form.watch("level") || 1;
  const alignment = form.watch("alignment") || "Neutral";
  
  // Calculate available powers and max power level based on character level
  const availablePowers = characterLevel + 1;
  const maxPowerLevel = Math.min(5, Math.ceil(characterLevel / 4));
  
  // Determine alignment for Force powers
  const forceAlignment = alignment?.includes("Light") 
    ? "Light" 
    : alignment?.includes("Dark") 
      ? "Dark" 
      : "Universal";

  useEffect(() => {
    // Reset powers when class changes
    if (selectedClass && !hasForcePowers) {
      form.setValue("forcePowers", []);
    }
    if (selectedClass && !hasTechPowers) {
      form.setValue("techPowers", []);
    }
  }, [selectedClass, hasForcePowers, hasTechPowers, form]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-yellow-400">Powers Selection</h2>
      
      {error && <Alert variant="destructive">{error}</Alert>}

      {(hasForcePowers || hasTechPowers) && (
        <Card className="bg-gray-800 bg-opacity-50 border-gray-700">
          <CardContent className="p-4">
            <p className="text-gray-300 mb-4">
              As a {selectedClassName}, you can select powers that enhance your abilities.
              {hasForcePowers && " You can use Force powers to manipulate the world around you."}
              {hasTechPowers && " You can use Tech powers to leverage advanced technology."}
            </p>
            
            <div className="text-yellow-300 mb-2">
              <span className="font-bold">Available Slots:</span> {availablePowers}
              <br />
              <span className="font-bold">Max Power Level:</span> {maxPowerLevel}
            </div>
          </CardContent>
        </Card>
      )}

      {hasForcePowers && (
        <div>
          <h3 className="text-lg font-medium mb-4 text-yellow-400">Force Powers</h3>
          <ForcePowersSelection
            form={form}
            availablePowers={availablePowers}
            maxPowerLevel={maxPowerLevel}
            alignment={forceAlignment}
          />
        </div>
      )}

      {hasTechPowers && (
        <div>
          <h3 className="text-lg font-medium mb-4 text-yellow-400">Tech Powers</h3>
          <TechPowersSelection
            form={form}
            availablePowers={availablePowers}
            maxPowerLevel={maxPowerLevel}
          />
        </div>
      )}

      {!hasForcePowers && !hasTechPowers && (
        <div className="text-center p-6 bg-gray-800/30 rounded-md border border-gray-700">
          <p className="text-gray-400">
            Your selected class ({selectedClassName || "None"}) does not have access to Force or Tech powers.
          </p>
        </div>
      )}
    </div>
  );
}
