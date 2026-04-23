"use client";

import { useEffect, useState } from "react";
import { Skill, SkillCard } from "@/components/skill-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload, Plus, Loader2, Trash2, Book } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Response } from "@/components/elements/response";

export function SkillsClient() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("Failed to fetch skills");
      const data = await res.json();
      setSkills(data);
    } catch (error) {
      toast.error("Could not load skills");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".md")) {
      toast.error("Please upload a .md file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let content = event.target?.result as string;
      let title = file.name
        .replace(".md", "")
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      let description = `Uploaded from ${file.name}`;
      const slug = file.name.replace(".md", "").toLowerCase();

      // Basic frontmatter parsing
      if (content.startsWith("---")) {
        const parts = content.split("---");
        if (parts.length >= 3) {
          const frontmatter = parts[1];
          const nameMatch = frontmatter.match(/name:\s*(.*)/);
          const descMatch = frontmatter.match(/description:\s*(.*)/);

          if (nameMatch) title = nameMatch[1].trim();
          if (descMatch) description = descMatch[1].trim();

          // Remove frontmatter from content for clean display
          content = parts.slice(2).join("---").trim();
        }
      }

      try {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, slug, content, description }),
        });

        if (!res.ok) throw new Error("Upload failed");
        toast.success(`Skill '${title}' uploaded!`);
        fetchSkills();
      } catch (error) {
        toast.error("Failed to upload skill");
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (slug: string) => {
    try {
      const res = await fetch(`/api/skills/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Skill deleted");
      setSkills(skills.filter((s) => s.slug !== slug));
    } catch (error) {
      toast.error("Failed to delete skill");
    }
  };

  const handleSkillClick = async (skill: Skill) => {
    setSelectedSkill(skill);
    setIsContentLoading(true);
    try {
      const res = await fetch(`/api/skills/${skill.slug}`);
      const data = await res.json();
      let content = data.content;

      // Clean frontmatter for display if it exists in stored content
      if (content.startsWith("---")) {
        const parts = content.split("---");
        if (parts.length >= 3) {
          content = parts.slice(2).join("---").trim();
        }
      }

      setSkillContent(content);
    } catch (error) {
      toast.error("Failed to load skill content");
    } finally {
      setIsContentLoading(false);
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border-b bg-background/50 backdrop-blur-md sticky top-0 z-20 gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <SidebarToggle />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">Knowledge & Skills</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="relative flex-1 sm:flex-none max-w-[200px] sm:max-w-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              placeholder="Search..."
              className="pl-8 w-full sm:w-48 bg-muted/20 border-border/30 rounded-full h-8 text-xs shadow-none transition-all focus:ring-1 focus:ring-primary/30 focus:bg-background/80"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] px-3 border-border/40" asChild>
              <label className="cursor-pointer">
                <Upload className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                <span className="hidden xs:inline">Upload</span>
                <input type="file" className="hidden" accept=".md" onChange={handleFileUpload} />
              </label>
            </Button>
            <Button size="sm" className="h-8 rounded-full text-[11px] px-3 shadow-sm shadow-primary/20" onClick={() => window.location.href = '/chat'}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              <span>Create</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60">
            <Search className="w-10 h-10 mb-3 opacity-10" />
            <p className="text-sm font-medium">No skills found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onDelete={handleDelete}
                onClick={handleSkillClick}
              />
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 overflow-hidden border-border/40 shadow-2xl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-bold truncate leading-tight">
                  {selectedSkill?.title}
                </DialogTitle>
                <DialogDescription className="mt-1 text-[11px] sm:text-xs line-clamp-2 leading-relaxed opacity-80">
                  {selectedSkill?.description}
                </DialogDescription>
              </div>
              {selectedSkill && !selectedSkill.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 px-2"
                  onClick={() => setSkillToDelete(selectedSkill.slug)}
                >
                  <Trash2 className="w-3.5 h-3.5 sm:mr-2" />
                  <span className="hidden sm:inline text-xs font-semibold">Delete</span>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
            {isContentLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
              </div>
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <Response>{skillContent || ""}</Response>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!skillToDelete}
        onOpenChange={(open) => !open && setSkillToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this skill?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This skill will be permanently
              removed from your personal knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (skillToDelete) {
                  handleDelete(skillToDelete);
                  setSkillToDelete(null);
                  setSelectedSkill(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
