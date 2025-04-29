import * as fs from "fs";

// Define a type for the species data (adapt to match your data structure)
type AbilityScoreIncrease = { [key: string]: number };

interface Species {
  id: string;
  name: string;
  summary: string;
  description: string;
  abilityScoreIncrease: AbilityScoreIncrease;
  size: string;
  speed: { walk: number };
  vision: { type: string; range?: number };
  traits: { name: string; description: string }[];
  languages: string[];
  source: string;
  commonClasses: string[];
}

// Function to load and parse the species data from a .ts file
const loadSpeciesData = (filePath: string): Species[] => {
  try {
    // Read the file content
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Extract the species data from the TypeScript export
    const dataMatch = fileContent.match(
      /export\s+const\s+speciesData\s*=\s*(\[\{.*\}\]);/s,
    );

    if (!dataMatch) {
      throw new Error("No valid data found in the species file.");
    }

    // Parse the JSON-like object from the matched data
    return JSON.parse(dataMatch[1]) as Species[];
  } catch (error) {
    console.error("Error parsing the file:", error);
    throw new Error("Failed to load species data.");
  }
};

// Function to fix the species data (example fixes)
const fixSpeciesData = (speciesData: Species[]): Species[] => {
  return speciesData.map((species) => {
    // Fix walk speed if it's missing or invalid (example fix)
    if (typeof species.speed.walk !== "number") {
      species.speed.walk = 30; // Set a default speed value
    }

    // Add any other fixes you need (e.g., fixing traits or languages)
    // For example, ensure that all species have valid traits:
    if (!species.traits || species.traits.length === 0) {
      species.traits = [
        {
          name: "Unknown Trait",
          description: "No trait description available",
        },
      ];
    }

    // Return the fixed species object
    return species;
  });
};

// Function to save the fixed species data to a new file
const saveFixedSpeciesData = (
  speciesData: Species[],
  outputFilePath: string,
): void => {
  try {
    const fixedData = JSON.stringify(speciesData, null, 2);
    fs.writeFileSync(outputFilePath, fixedData, "utf-8");
    console.log("Species data fixed and saved successfully!");
  } catch (error) {
    console.error("Error saving fixed species data:", error);
  }
};

// Main function to load, fix, and save the species data
const main = () => {
  const inputFilePath = "./client/src/lib/sw5e/species.ts"; // Path to the species.ts file
  const outputFilePath = "./fixed_species_data.json"; // Path to save the fixed species data

  try {
    const speciesData = loadSpeciesData(inputFilePath);
    const fixedSpeciesData = fixSpeciesData(speciesData);
    saveFixedSpeciesData(fixedSpeciesData, outputFilePath);
  } catch (error) {
    console.error("Error:", error);
  }
};

// Run the script
main();
