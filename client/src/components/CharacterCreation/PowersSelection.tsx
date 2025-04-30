import React from "react";
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
  getSelectedClass,
}: PowersSelectionProps) {
  const selectedClass = getSelectedClass();
  const hasForcePowers = selectedClass?.spellcasting?.type === "Force";
  const hasTechPowers = selectedClass?.spellcasting?.type === "Tech";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Powers Selection</h2>

      {hasForcePowers && (
        <div>
          <h3 className="text-lg font-medium mb-4">Force Powers</h3>
          <ForcePowersSelection
            form={form}
            availablePowers={form.watch("level") + 1}
            maxPowerLevel={Math.min(5, Math.ceil(form.watch("level") / 4))}
            alignment={
              form.watch("alignment")?.includes("Light")
                ? "Light"
                : form.watch("alignment")?.includes("Dark")
                  ? "Dark"
                  : "Neutral"
            }
          />
        </div>
      )}

      {hasTechPowers && (
        <div>
          <h3 className="text-lg font-medium mb-4">Tech Powers</h3>
          <TechPowersSelection
            form={form}
            availablePowers={form.watch("level") + 1}
            maxPowerLevel={Math.min(5, Math.ceil(form.watch("level") / 4))}
          />
        </div>
      )}

      {!hasForcePowers && !hasTechPowers && (
        <div className="text-center p-6 bg-gray-800/30 rounded-md border border-gray-700">
          <p className="text-gray-400">
            Your selected class does not have access to Force or Tech powers.
          </p>
        </div>
      )}
    </div>
  );
}
