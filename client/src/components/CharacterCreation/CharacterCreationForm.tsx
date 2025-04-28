import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { starSystems } from "@/lib/sw5e/starSystems";

export default function CharacterCreationForm({ form }: { form: any }) {
  const alignments = [
    "Lawful Light",
    "Neutral Light",
    "Chaotic Light",
    "Lawful Balanced",
    "Neutral Balanced",
    "Chaotic Balanced",
    "Lawful Dark",
    "Neutral Dark",
    "Chaotic Dark",
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Character Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter character name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="alignment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alignment</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an alignment" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {alignments.map((alignment) => (
                    <SelectItem key={alignment} value={alignment}>
                      {alignment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Your character's ethical and moral outlook.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="startingLocation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Starting Location</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a star system" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {starSystems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Where your character's journey will begin.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="backstory"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Character Backstory</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe your character's history and motivations..." 
                  className="h-32"
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Provide details about your character's past, motivations, and goals.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
