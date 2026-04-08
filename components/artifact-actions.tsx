import { type Dispatch, memo, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { artifactDefinitions, type UIArtifact } from "./artifact";
import type { ArtifactActionContext } from "./create-artifact";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ArtifactActionsProps = {
  artifact: UIArtifact;
  handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: "edit" | "diff";
  metadata: any;
  setMetadata: Dispatch<SetStateAction<any>>;
};

function PureArtifactActions({
  artifact,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  metadata,
  setMetadata,
}: ArtifactActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  const actionContext: ArtifactActionContext = {
    content: artifact.content,
    handleVersionChange,
    currentVersionIndex,
    isCurrentVersion,
    mode,
    metadata,
    setMetadata,
  };

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {artifactDefinition.actions.map((action) => {
        const isDisabled =
          isLoading || artifact.status === "streaming"
            ? true
            : action.isDisabled
              ? action.isDisabled(actionContext)
              : false;
        const isActive = action.isActive ? action.isActive(actionContext) : false;

        if (action.menuItems?.length) {
          return (
            <DropdownMenu key={action.description}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className={cn("h-fit dark:hover:bg-zinc-700", {
                        "p-2": !action.label,
                        "px-2 py-1.5": action.label,
                        "bg-accent text-accent-foreground": isActive,
                      })}
                      disabled={isDisabled}
                      variant="outline"
                    >
                      {action.icon}
                      {action.label}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{action.description}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                {action.menuItems.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onSelect={async () => {
                      setIsLoading(true);
                      try {
                        await Promise.resolve(item.onClick(actionContext));
                      } catch (_error) {
                        toast.error("Failed to execute action");
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <Tooltip key={action.description}>
            <TooltipTrigger asChild>
              <Button
                className={cn("h-fit dark:hover:bg-zinc-700", {
                  "p-2": !action.label,
                  "px-2 py-1.5": action.label,
                  "bg-accent text-accent-foreground": isActive,
                })}
                disabled={isDisabled}
                onClick={async () => {
                  setIsLoading(true);

                  try {
                    await Promise.resolve(action.onClick(actionContext));
                  } catch (_error) {
                    toast.error("Failed to execute action");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                variant="outline"
              >
                {action.icon}
                {action.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{action.description}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export const ArtifactActions = memo(
  PureArtifactActions,
  (prevProps, nextProps) => {
    if (prevProps.artifact.status !== nextProps.artifact.status) {
      return false;
    }
    if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) {
      return false;
    }
    if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) {
      return false;
    }
    if (prevProps.artifact.content !== nextProps.artifact.content) {
      return false;
    }

    return true;
  }
);
