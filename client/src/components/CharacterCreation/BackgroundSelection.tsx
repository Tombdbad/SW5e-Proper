
import React from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { backgrounds, BACKGROUNDS } from "@/lib/sw5e/backgrounds";

interface BackgroundSelectionProps {
  onSelect: () => void;
}

export default function BackgroundSelection({ onSelect }: BackgroundSelectionProps) {
  const { control, watch } = useFormContext();
  const selectedBackground = watch("background");

  const backgroundInfo = backgrounds.find(b => b.id === selectedBackground);

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="background"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Background</FormLabel>
            <FormControl>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select background" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-72">
                    {BACKGROUNDS.map((background) => (
                      <SelectItem key={background.id} value={background.id}>
                        {background.name}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {backgroundInfo && (
        <div className="bg-gray-800 bg-opacity-50 rounded-md p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">{backgroundInfo.name}</h3>
          <p className="text-gray-300 mb-2">{backgroundInfo.summary}</p>
          
          <div className="mt-4">
            <h4 className="text-yellow-400 text-sm font-medium mb-1">Feature: {backgroundInfo.feature}</h4>
            <p className="text-sm text-gray-300">{backgroundInfo.featureDescription}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Skill Proficiencies</h4>
              <ul className="list-disc pl-5 text-sm">
                {backgroundInfo.skillProficiencies.map((skill, index) => (
                  <li key={index}>{skill}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Tool Proficiencies</h4>
              <ul className="list-disc pl-5 text-sm">
                {backgroundInfo.toolProficiencies.length > 0 ? (
                  backgroundInfo.toolProficiencies.map((tool, index) => (
                    <li key={index}>{tool}</li>
                  ))
                ) : (
                  <li>None</li>
                )}
              </ul>
            </div>
          </div>
          
          <Button onClick={onSelect} className="mt-4">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
