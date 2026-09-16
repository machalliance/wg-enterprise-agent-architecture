"use client";

import type { UserContent } from "ai";
import { useEveAgent } from "eve/react";
import { AlertCircleIcon, BrainIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { OPEN_BATCH_PROMPT } from "@/app/_data/queue";
import { AgentMessage } from "./agent-message";

export function AgentChat({
  sessionId,
}: {
  readonly sessionId?: string;
}) {
  const [cancellationError, setCancellationError] = useState<string>();
  const agent = useEveAgent({
    initialSession:
      sessionId === undefined
        ? undefined
        : {
            sessionId,
            streamIndex: 0,
          },
    resume: sessionId !== undefined,
    onSessionChange(session) {
      if (sessionId === undefined && session !== undefined) {
        // Next patches window.history to navigate, which would detach the active stream.
        const nativeReplaceState = Object.getPrototypeOf(window.history).replaceState as (
          this: typeof window.history,
          data: unknown,
          unused: string,
          url?: string | URL | null,
        ) => void;
        nativeReplaceState.call(
          window.history,
          window.history.state,
          "",
          `/s/${encodeURIComponent(session.sessionId)}`,
        );
      }
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isRestoring = sessionId !== undefined && agent.events.length === 0 && isBusy;
  const isEmpty = agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start");
  const showPendingThinking =
    isBusy &&
    (agent.status === "submitted" || lastMessage?.role !== "assistant" || isPendingAssistantShell);
  const turnFailure = isBusy ? undefined : getLatestTurnFailure(agent.events);
  const errorMessage = cancellationError ?? agent.error?.message ?? turnFailure;
  const hasConversationContent = !isEmpty || errorMessage !== undefined;
  const showConversationLayout = isRestoring || hasConversationContent;
  const activeSessionId = sessionId ?? agent.session?.sessionId;

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
    });
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isRestoring) return;

    setCancellationError(undefined);
    const options = isBusy ? { turnPolicy: "steer" as const } : undefined;

    if (message.files.length === 0) {
      await agent.send(text, options);
      return;
    }

    const parts: UserContent = [];
    if (text.length > 0) {
      parts.push({ text, type: "text" });
    }
    for (const file of message.files) {
      parts.push({
        data: file.url,
        filename: file.filename,
        mediaType: file.mediaType,
        type: "file",
      });
    }

    await agent.send(parts, options);
  };

  const openBatch = () => {
    if (isBusy || isRestoring) return;
    setCancellationError(undefined);
    void agent.send(OPEN_BATCH_PROMPT);
  };

  const composer = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputTextarea
        disabled={isRestoring}
        placeholder="Open the batch, or name a TX…"
      />
      {isBusy && !isRestoring ? (
        <PromptInputButton
          aria-label="Stop"
          className="absolute right-12 bottom-2.5 rounded-full"
          onClick={requestCancellation}
          variant="default"
        >
          <SquareIcon className="size-3 fill-current" />
        </PromptInputButton>
      ) : null}
      <PromptInputSubmit disabled={isRestoring} status={isBusy ? undefined : agent.status} />
    </PromptInput>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <p className="font-condensed text-base uppercase tracking-[0.03em]">Desk run</p>
          <p className="truncate font-mono text-[11px] text-text-3">
            {activeSessionId ?? "No session yet"}
          </p>
        </div>
        {activeSessionId !== undefined ? (
          <Button
            aria-label="Start a new run"
            onClick={() => window.location.assign("/s")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
            <span className="hidden sm:inline">New run</span>
          </Button>
        ) : null}
      </div>

      {showConversationLayout ? (
        <Conversation
          className="min-h-0 flex-1"
          initial={sessionId === undefined ? undefined : false}
          resize={activeSessionId === undefined ? "smooth" : "instant"}
          scrollRestorationKey={
            isEmpty || activeSessionId === undefined
              ? undefined
              : `eve:web-chat-scroll:${activeSessionId}`
          }
        >
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 pt-6 pb-8 sm:px-6">
            {agent.data.messages.map((message, index) =>
              showPendingThinking &&
              isPendingAssistantShell &&
              message.id === lastMessage.id ? null : (
                <AgentMessage
                  canRespond={!isBusy}
                  isStreaming={
                    agent.status === "streaming" && index === agent.data.messages.length - 1
                  }
                  key={message.id}
                  message={message}
                  onInputResponses={(inputResponses) => {
                    setCancellationError(undefined);
                    return agent.respond(inputResponses);
                  }}
                />
              ),
            )}
            {showPendingThinking ? <PendingThinking /> : null}
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="wp-eyebrow">Outbound exceptions</p>
            <h2 className="mt-2 font-condensed text-3xl uppercase tracking-[0.03em]">
              One batch failed the gate
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Twelve instructions, three dispositions, a definite stop. The desk
              repairs what reference data uniquely determines, proposes the rest,
              and will not touch a screening hold.
            </p>
            <Button className="mt-6" onClick={openBatch} type="button">
              Open the batch
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              Inspect, investigate, act, adapt, stop.{" "}
              <a className="text-action underline-offset-4 hover:underline" href="/architecture">
                How Vercel hosts the loop
              </a>
            </p>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">{composer}</div>
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <div
          className="flex w-full items-start gap-3 rounded-md border border-error border-l-4 bg-error-wash px-3 py-2.5 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-error" />
          <div>
            <p className="font-bold text-error">Request failed</p>
            <p className="mt-0.5 text-text-2">{message}</p>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-muted-foreground text-sm">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to cancel the response.";
}

function getLatestTurnFailure(
  events: ReturnType<typeof useEveAgent>["events"],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "turn.failed") {
      return event.data.code === "MODEL_CALL_FAILED"
        ? "The model is temporarily unavailable. Please try again."
        : event.data.message;
    }

    if (event.type === "turn.completed" || event.type === "turn.cancelled") {
      return undefined;
    }

    if (event.type === "message.received") {
      return undefined;
    }
  }

  return undefined;
}
