import { ArchitectureView } from "@/app/_components/architecture-view";
import { DeskChrome } from "@/app/_components/desk-chrome";

export default function ArchitecturePage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <DeskChrome active="architecture" />
      <ArchitectureView />
    </div>
  );
}
