"use client";

import { BookText, Bot, CalendarClock, Image as ImageIcon, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ActivityIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const handleDeleteAll = () => {
    const deletePromise = fetch("/api/history", {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        setShowDeleteAllDialog(false);
        router.replace("/chat");
        router.refresh();
        return "All chats deleted successfully";
      },
      error: "Failed to delete all chats",
    });
  };

  return (
    <>
      <Sidebar className="group-data-[side=left]:border-r-0 [&_[data-sidebar=sidebar]]:border-r [&_[data-sidebar=sidebar]]:border-sidebar-border/70 [&_[data-sidebar=sidebar]]:bg-sidebar/95 [&_[data-sidebar=sidebar]]:backdrop-blur-xl">
        <SidebarHeader className="px-3 pt-3 pb-2">
          <div className="flex flex-row items-center px-1 pt-1 pb-1">
            <Link
              className="flex min-w-0 flex-row items-center gap-2"
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm shadow-sm">
                E
              </span>
              <span className="cursor-pointer truncate font-semibold text-lg transition-colors hover:text-foreground/80">
                Etles
              </span>
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pb-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/chat");
                      router.refresh();
                    }}
                  >
                    <PlusIcon />
                    <span>New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/subagents");
                    }}
                  >
                    <Bot className="size-4" />
                    <span>Subagents</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/campaigns");
                    }}
                  >
                    <Megaphone className="size-4" />
                    <span>Campaigns</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/agent-status");
                    }}
                  >
                    <ActivityIcon />
                    <span>Agent Status</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="min-h-11 rounded-lg" onClick={() => { setOpenMobile(false); router.push("/calendar"); }}>
                    <CalendarClock className="size-4" />
                    <span>Agent Calendar</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/skills");
                    }}
                  >
                    <BookText className="size-4" />
                    <span>Skills</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="min-h-11 rounded-lg"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/media");
                    }}
                  >
                    <ImageIcon className="size-4" />
                    <span>Media Library</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="h-9 rounded-lg text-muted-foreground hover:text-destructive"
                      onClick={() => setShowDeleteAllDialog(true)}
                    >
                      <TrashIcon />
                      <span>Clear History</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarHistory user={user} />
        </SidebarContent>
        <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
