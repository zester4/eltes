"use client";

import { memo, useState } from "react";
import { Book, Trash2, Globe, Lock, MoreVertical, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export interface Skill {
  id: string;
  slug: string;
  title: string;
  description: string;
  isDefault: boolean;
  updatedAt?: string | Date;
}

interface SkillCardProps {
  skill: Skill;
  onDelete?: (slug: string) => void;
  onClick: (skill: Skill) => void;
}

export const SkillCard = memo(({ skill, onDelete, onClick }: SkillCardProps) => {
  return (
    <Card 
      className="group relative flex flex-col h-full hover:shadow-sm transition-all duration-200 cursor-pointer border-border/40 bg-surface shadow-none"
      onClick={() => onClick(skill)}
    >
      <CardHeader className="p-3 pb-1.5">
        <div className="flex items-start justify-between">
          <div className="p-1.5 rounded-md bg-primary/5 text-primary/80 mb-2">
            {skill.isDefault ? <Globe className="w-3.5 h-3.5" /> : <Book className="w-3.5 h-3.5" />}
          </div>
          {!skill.isDefault && onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  className="text-destructive focus:bg-destructive/10 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(skill.slug);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Skill
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <CardTitle className="text-sm font-semibold line-clamp-1 tracking-tight">{skill.title}</CardTitle>
        <Badge variant={skill.isDefault ? "secondary" : "outline"} className="w-fit text-[9px] px-1 py-0 h-4 mt-0.5 font-medium uppercase tracking-wider opacity-70">
          {skill.isDefault ? "Global" : "Private"}
        </Badge>
      </CardHeader>
      <CardContent className="px-3 pb-3 flex-1">
        <CardDescription className="text-[11px] line-clamp-2 leading-snug text-muted-foreground/80">
          {skill.description || "No description provided."}
        </CardDescription>
      </CardContent>
      <CardFooter className="px-3 py-2 flex items-center justify-between text-[9px] text-muted-foreground/60 border-t border-border/30 mt-auto bg-muted/5">
        <div className="flex items-center gap-1">
          <FileText className="w-2.5 h-2.5" />
          <span className="font-medium">MARKDOWN</span>
        </div>
        {skill.updatedAt && (
          <span className="font-medium">
            {formatDistanceToNow(new Date(skill.updatedAt))} AGO
          </span>
        )}
      </CardFooter>
    </Card>
  );
});

SkillCard.displayName = "SkillCard";
