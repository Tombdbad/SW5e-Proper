
import React, { useState, useEffect } from "react";
import { useFormContext, Controller } from "react-hook-form";
import TranslucentPane from "../ui/TranslucentPane";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";

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
  getSelectedClass 
}: PowersSelectionProps) {
  const { watch, setValue } = form;
  const selectedClass = getSelectedClass();
  const [hasForceCasting, setHasForceCasting] = useState(false);
  const [hasTechCasting, setHasTechCasting] = useState(false);
  const [castingAbility, setCastingAbility] = useState("");
  const [powerType, setPowerType] = useState<"Force" | "Tech" | null>(null);
  
  // Monitor class changes to determine casting abilities
  useEffect(() => {
    if (!selectedClass) {
      setHasForceCasting(false);
      setHasTechCasting(false);
      setPowerType(null);
      return;
    }
    
    // Determine if class has force or tech casting
    const hasForce = selectedClass.spellcasting?.type === "Force";
    const hasTech = selectedClass.spellcasting?.type === "Tech";
    
    setHasForceCasting(hasForce);
    setHasTechCasting(hasTech);
    
    if (hasForce) {
      setPowerType("Force");
      setCastingAbility(selectedClass.spellcasting?.ability || "");
    } else if (hasTech) {
      setPowerType("Tech");
      setCastingAbility(selectedClass.spellcasting?.ability || "");
    } else {
      setPowerType(null);
    }
  }, [selectedClass]);

  if (!selectedClass) {
    return (
      <div className="text-center p-6">
        <p className="text-yellow-400 text-lg">Please select a class first to determine available powers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Powers Selection</h2>
      
      {!hasForceCasting && !hasTechCasting && (
        <TranslucentPane className="p-4">
          <p className="text-center text-white">
            The {selectedClass.name} class does not have access to Force or Tech powers.
          </p>
        </TranslucentPane>
      )}
      
      {hasForceCasting && (
        <TranslucentPane className="p-4">
          <h3 className="text-xl font-semibold text-yellow-400 mb-3">Force Powers</h3>
          <p className="mb-4 text-yellow-200">
            As a Force-wielding {selectedClass.name}, you can select Force powers based on your level and {castingAbility}.
          </p>
          <ForcePowersSelection 
            form={form} 
            forcePowers={forcePowers} 
            maxPowerLevel={selectedClass.spellcasting?.maxPowerLevel || 0}
            castingAbility={castingAbility}
          />
        </TranslucentPane>
      )}
      
      {hasTechCasting && (
        <TranslucentPane className="p-4">
          <h3 className="text-xl font-semibold text-yellow-400 mb-3">Tech Powers</h3>
          <p className="mb-4 text-yellow-200">
            As a tech-wielding {selectedClass.name}, you can select Tech powers based on your level and {castingAbility}.
          </p>
          <TechPowersSelection 
            form={form} 
            techPowers={techPowers} 
            maxPowerLevel={selectedClass.spellcasting?.maxPowerLevel || 0}
            castingAbility={castingAbility}
          />
        </TranslucentPane>
      )}
    </div>
  );
}
