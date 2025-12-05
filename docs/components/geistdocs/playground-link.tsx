import { SquareTerminal } from 'lucide-react';

export const PlaygroundLink = () => {
  return (
    <a
      className="flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
      href="https://workflow-swc-playground.vercel.app/"
      rel="noopener noreferrer"
      target="_blank"
    >
      <SquareTerminal className="size-3.5" />
      <span>Compiler Playground</span>
    </a>
  );
};
