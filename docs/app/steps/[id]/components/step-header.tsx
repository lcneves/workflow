import { Badge } from '@/components/ui/badge';
import type { StepCategory, StepType } from '../../steps-data';

interface StepHeaderProps {
  name: string;
  description: string;
  category: StepCategory;
  type: StepType;
  tags?: string[];
}

export function StepHeader({
  name,
  description,
  category,
  type,
  tags = [],
}: StepHeaderProps) {
  return (
    <div>
      <h1 className="mb-3 text-4xl font-bold tracking-tight">{name}</h1>
      <p className="text-lg text-muted-foreground">{description}</p>

      {/* Tags */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary">{category}</Badge>
        <Badge variant="outline">{type}</Badge>
        {tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
