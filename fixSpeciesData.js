"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
// Function to load and parse the species data from a .ts file
var loadSpeciesData = function (filePath) {
    try {
        // Read the file content
        var fileContent = fs.readFileSync(filePath, "utf-8");
        // Extract the species data from the TypeScript export
        var dataMatch = fileContent.match(/export\s+const\s+speciesData\s*=\s*(\[\{.*\}\]);/s);
        if (!dataMatch) {
            throw new Error("No valid data found in the species file.");
        }
        // Parse the JSON-like object from the matched data
        return JSON.parse(dataMatch[1]);
    }
    catch (error) {
        console.error("Error parsing the file:", error);
        throw new Error("Failed to load species data.");
    }
};
// Function to fix the species data (example fixes)
var fixSpeciesData = function (speciesData) {
    return speciesData.map(function (species) {
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
var saveFixedSpeciesData = function (speciesData, outputFilePath) {
    try {
        var fixedData = JSON.stringify(speciesData, null, 2);
        fs.writeFileSync(outputFilePath, fixedData, "utf-8");
        console.log("Species data fixed and saved successfully!");
    }
    catch (error) {
        console.error("Error saving fixed species data:", error);
    }
};
// Main function to load, fix, and save the species data
var main = function () {
    var inputFilePath = "./client/src/lib/sw5e/species.ts"; // Path to the species.ts file
    var outputFilePath = "./fixed_species_data.json"; // Path to save the fixed species data
    try {
        var speciesData = loadSpeciesData(inputFilePath);
        var fixedSpeciesData = fixSpeciesData(speciesData);
        saveFixedSpeciesData(fixedSpeciesData, outputFilePath);
    }
    catch (error) {
        console.error("Error:", error);
    }
};
// Run the script
main();
