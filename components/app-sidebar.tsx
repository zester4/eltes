"use client";

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
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
      <Sidebar className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <div className="flex flex-row items-center px-2 pt-2 pb-1">
            <Link
              className="flex flex-row items-center gap-2"
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
            >
              <span className="cursor-pointer font-semibold text-lg hover:text-foreground/80 transition-colors">
                Etles
              </span>
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="pb-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton 
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
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/subagents");
                    }}
                  >
                    <div className="flex h-4 w-4 items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                    </div>
                    <span>Subagents</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                     onClick={() => {
                       setOpenMobile(false);
                       router.push("/agent-status");
                     }}
                  >
                    <ActivityIcon />
                    <span>Agent Status</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setShowDeleteAllDialog(true)}>
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
