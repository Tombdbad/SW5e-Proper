
import { Card } from "@/components/ui/card";
import { useState } from "react";

export function TestCard({ id, title, onSelect }: { id: string; title: string; onSelect: (id: string) => void }) {
  const [isSelected, setIsSelected] = useState(false);

  const handleClick = () => {
    setIsSelected(!isSelected);
    onSelect(id);
    console.log('Card clicked:', id);
  };

  return (
    <Card 
      className={`border-2 cursor-pointer transition-all ${
        isSelected ? 'border-yellow-400 bg-yellow-50' : 'hover:border-yellow-400'
      }`}
      onClick={handleClick}
    >
      {title}
    </Card>
  );
}
