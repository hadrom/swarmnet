"use client";

import { MessageSquarePlus, PanelLeftClose, PanelLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatChatTime,
  type ChatSnapshot,
} from "@/lib/chat-history";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onToggle: () => void;
  chats: ChatSnapshot[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ChatSidebar({
  open,
  onToggle,
  chats,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
}: Props) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close chat history"
          className="fixed inset-0 z-30 bg-zinc-950/30 lg:hidden"
          onClick={onToggle}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[15.5rem] flex-col border-r border-zinc-200 bg-zinc-100/95 backdrop-blur transition-transform dark:border-zinc-800 dark:bg-zinc-900/95 lg:static lg:z-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          !open && "lg:hidden",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-start gap-2 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            onClick={onNewChat}
            title="Start a new chat"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New chat
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2 lg:inline-flex"
            onClick={onToggle}
            title={open ? "Hide chat history" : "Show chat history"}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-3 pb-1 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Chats
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
          {chats.length === 0 ? (
            <p className="px-2 py-6 text-xs leading-relaxed text-zinc-500">
              Conversations you start are saved here. Open one anytime to pick
              up where you left off.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const active = chat.id === activeId;
                return (
                  <li key={chat.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(chat.id)}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-700 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80",
                      )}
                      title={chat.title}
                    >
                      <span className="line-clamp-2 pr-6 text-[13px] font-medium leading-snug">
                        {chat.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-zinc-500">
                        {formatChatTime(chat.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${chat.title}`}
                      title="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(chat.id);
                      }}
                      className={cn(
                        "absolute right-1.5 top-1.5 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100",
                        active && "opacity-100",
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}

export function ChatSidebarToggle({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn("px-2", className)}
      title="Chat history"
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only sm:ml-1.5">History</span>
    </Button>
  );
}
