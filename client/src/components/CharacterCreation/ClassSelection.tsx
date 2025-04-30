import React, { useState } from "react";
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
import { CLASSES } from "@/lib/sw5e/classes";

interface ClassSelectionProps {
  onSelect: () => void;
}

export default function ClassSelection({ onSelect }: ClassSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedClass = watch("class");

  const classInfo = CLASSES.find(c => c.id === selectedClass);

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="class"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Class</FormLabel>
            <FormControl>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-72">
                    {CLASSES.map((classOption) => (
                      <SelectItem key={classOption.id} value={classOption.id}>
                        {classOption.name}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
            {field.value && (
              <div className="mt-4 p-3 bg-black bg-opacity-30 rounded border border-yellow-500/20 text-sm">
                {CLASSES.find(c => c.id === field.value)?.description || (
                  <span className="text-yellow-300/50 italic">Select a class to view its description</span>
                )}
              </div>
            )}
          </FormItem>
        )}
      />

      {classInfo && (
        <div className="bg-gray-800 bg-opacity-50 rounded-md p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">{classInfo.name}</h3>
          <p className="text-gray-300 mb-4">{classInfo.summary}</p>

          <Button onClick={onSelect} className="mt-2">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}