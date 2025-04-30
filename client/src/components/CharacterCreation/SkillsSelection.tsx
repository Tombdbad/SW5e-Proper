
import React, { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import TranslucentPane from "../ui/TranslucentPane";

interface SkillsSelectionProps {
  form: any;
  allSkills: any[];
  getSelectedClass: () => any;
}

export default function SkillsSelection({
  form,
  allSkills,
  getSelectedClass,
}: SkillsSelectionProps) {
  const { watch, setValue } = form;
  const selectedClass = getSelectedClass();
  const selectedBackground = watch("background");
  const selectedSkills = watch("skillProficiencies") || [];
  
  const [availableSkills, setAvailableSkills] = useState<any[]>([]);
  const [maxSkillChoices, setMaxSkillChoices] = useState(0);
  const [backgroundSkills, setBackgroundSkills] = useState<string[]>([]);
  const [classSkillOptions, setClassSkillOptions] = useState<string[]>([]);
  
  // Group skills by ability
  const groupedSkills = allSkills.reduce((acc, skill) => {
    const ability = skill.ability.charAt(0).toUpperCase() + skill.ability.slice(1);
    if (!acc[ability]) {
      acc[ability] = [];
    }
    acc[ability].push(skill);
    return acc;
  }, {} as Record<string, any[]>);

  // Set up available skills and skill count when class or background changes
  useEffect(() => {
    if (!selectedClass) return;
    
    // Get class skill choices
    const classSkills = selectedClass.skillChoices || [];
    setClassSkillOptions(classSkills);
    setMaxSkillChoices(selectedClass.numSkillChoices || 0);

    // Get background skill proficiencies
    const backgrounds = Array.isArray(watch("background")) 
      ? watch("background") 
      : [watch("background")];
      
    const bgSkills: string[] = [];
    backgrounds.forEach(bg => {
      // This is just a placeholder. Replace with actual background logic
      // Check if background data has skill proficiencies
      const backgroundData = { skillProficiencies: [] }; // Replace with actual lookup
      if (backgroundData?.skillProficiencies) {
        bgSkills.push(...backgroundData.skillProficiencies);
      }
    });
    
    setBackgroundSkills(bgSkills);
    
    // Filter skills to only include class skills that aren't already from background
    const availableSkillsFromClass = allSkills
      .filter(skill => classSkills.includes(skill.id))
      .filter(skill => !bgSkills.includes(skill.id));
    
    setAvailableSkills(availableSkillsFromClass);
    
    // Auto-select background skills
    setValue(
      "skillProficiencies", 
      [...bgSkills, ...selectedSkills.filter(skill => !bgSkills.includes(skill))]
    );
  }, [selectedClass, selectedBackground, allSkills, setValue]);

  // Handle skill selection
  const toggleSkill = (skillId: string) => {
    const isSelected = selectedSkills.includes(skillId);
    const isBackgroundSkill = backgroundSkills.includes(skillId);
    
    // Can't toggle background skills off
    if (isBackgroundSkill) return;
    
    if (isSelected) {
      // Remove skill
      setValue(
        "skillProficiencies",
        selectedSkills.filter(id => id !== skillId)
      );
    } else {
      // Check if max skills selected (excluding background skills)
      const userSelectedSkillCount = selectedSkills.filter(
        id => !backgroundSkills.includes(id)
      ).length;
      
      if (userSelectedSkillCount >= maxSkillChoices) {
        alert(`You can only select ${maxSkillChoices} skills from your class.`);
        return;
      }
      
      // Add skill
      setValue("skillProficiencies", [...selectedSkills, skillId]);
    }
  };

  if (!selectedClass) {
    return (
      <div className="text-center p-6">
        <p className="text-yellow-400 text-lg">Please select a class first to determine available skills.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Skill Proficiencies</h2>
      
      <TranslucentPane className="p-4">
        <div className="mb-4">
          <p className="text-yellow-200">
            Choose <span className="font-bold">{maxSkillChoices}</span> skills from the options available to the {selectedClass.name} class.
          </p>
          
          {backgroundSkills.length > 0 && (
            <p className="mt-2 text-yellow-200">
              You also have proficiency in {backgroundSkills.join(", ")} from your background.
            </p>
          )}
          
          <div className="bg-gray-800 bg-opacity-50 p-3 mt-3 rounded-md">
            <span className="text-yellow-300 font-semibold">Skills Selected:</span>{" "}
            <span className="text-white">
              {selectedSkills.filter(id => !backgroundSkills.includes(id)).length}/{maxSkillChoices}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(groupedSkills).map(([ability, skills]) => (
            <div key={ability} className="bg-gray-800 bg-opacity-30 p-4 rounded-md">
              <h3 className="text-xl font-semibold text-yellow-400 mb-3">{ability} Skills</h3>
              <ul className="space-y-2">
                {skills.map(skill => {
                  const isClassSkill = classSkillOptions.includes(skill.id);
                  const isBackgroundSkill = backgroundSkills.includes(skill.id);
                  const isSelected = selectedSkills.includes(skill.id);
                  
                  return (
                    <li 
                      key={skill.id}
                      className={`
                        flex items-center p-2 rounded-md transition-colors
                        ${isClassSkill ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}
                        ${isSelected ? "bg-yellow-900 bg-opacity-40" : "hover:bg-gray-700"}
                        ${isBackgroundSkill ? "bg-blue-900 bg-opacity-30" : ""}
                      `}
                      onClick={() => isClassSkill && toggleSkill(skill.id)}
                    >
                      <div className={`
                        w-5 h-5 mr-3 border rounded flex items-center justify-center
                        ${isSelected 
                          ? "bg-yellow-500 border-yellow-600" 
                          : "border-gray-500"
                        }
                        ${isBackgroundSkill ? "bg-blue-500 border-blue-600" : ""}
                      `}>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-900" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">{skill.name}</div>
                        <div className="text-gray-400 text-sm">{skill.description}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </TranslucentPane>
    </div>
  );
}
