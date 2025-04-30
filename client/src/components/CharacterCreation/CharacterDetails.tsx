import React from "react";
import { useFormContext } from "react-hook-form";
import { CharacterData } from "../../pages/CharacterCreation";
import { ALIGNMENTS } from "../../lib/sw5e/constants";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface CharacterDetailsProps {
  form: ReturnType<typeof useFormContext<CharacterData>>;
}

const CharacterDetails: React.FC<CharacterDetailsProps> = ({ form }) => {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">
        Basic Character Details
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Character Name</Label>
          <Input
            {...register("name")}
            placeholder="Enter character name"
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <Label>Alignment</Label>
          <Select
            onValueChange={(value) => form.setValue("alignment", value)}
            defaultValue={form.getValues("alignment")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select alignment" />
            </SelectTrigger>
            <SelectContent>
              {ALIGNMENTS.map((alignment) => (
                <SelectItem key={alignment} value={alignment}>
                  {alignment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.alignment && (
            <p className="text-red-500 text-sm mt-1">
              {errors.alignment.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Gender</Label>
          <Input {...register("gender")} placeholder="Optional" />
        </div>

        <div>
          <Label>Age</Label>
          <Input
            type="number"
            {...register("age", { valueAsNumber: true })}
            placeholder="25"
          />
        </div>

        <div>
          <Label>Level</Label>
          <Input
            type="number"
            {...register("level", { valueAsNumber: true })}
            min={1}
            max={20}
            defaultValue={1}
          />
          {errors.level && (
            <p className="text-red-500 text-sm mt-1">{errors.level.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Height</Label>
          <Input {...register("height")} placeholder="e.g., 1.8m or 6ft" />
        </div>

        <div>
          <Label>Weight</Label>
          <Input {...register("weight")} placeholder="e.g., 75kg or 165lbs" />
        </div>
      </div>

      <div>
        <Label>Character Description</Label>
        <Textarea
          {...register("description")}
          rows={4}
          placeholder="Describe your character's appearance, personality, and background..."
        />
      </div>

      <div className="bg-blue-900 bg-opacity-20 p-4 rounded-md mt-6">
        <h3 className="text-blue-300 font-semibold mb-2">
          Character Detail Tips
        </h3>
        <ul className="list-disc list-inside text-sm space-y-1 text-blue-100">
          <li>Your character name should reflect the Star Wars universe.</li>
          <li>
            Alignment affects certain Force abilities and roleplaying options.
          </li>
          <li>
            Character description helps the Game Master integrate your character
            into the campaign setting.
          </li>
          <li>
            Starting characters are typically level 1, but your Game Master may
            specify a different starting level.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default CharacterDetails;
