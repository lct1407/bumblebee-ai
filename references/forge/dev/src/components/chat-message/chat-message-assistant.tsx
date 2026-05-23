import type { AgentTodo, ContentBlock, ToolCall } from "@/lib/types";
import { Markdown } from "../ui/markdown";
import { ToolCallGroup } from "./chat-message-tool-calls";
import { TodoProgress } from "./chat-message-todos";

export function DarkMarkdown({ text }: { text: string }) {
  return <Markdown theme="dark">{text}</Markdown>;
}

type RenderedItem =
  | { type: "text"; block: ContentBlock; key: number }
  | { type: "tools"; tools: ToolCall[]; key: number }
  | { type: "todos"; todos: AgentTodo[]; key: number };

function renderBlockItem(item: RenderedItem): React.ReactNode {
  switch (item.type) {
    case "text":
      return item.block.text ? <DarkMarkdown key={item.key} text={item.block.text} /> : null;
    case "tools":
      return <ToolCallGroup key={item.key} tools={item.tools} />;
    case "todos":
      return <TodoProgress key={item.key} todos={item.todos} />;
    default:
      return null;
  }
}

function groupBlocksByType(blocks: ContentBlock[]): RenderedItem[] {
  const result: RenderedItem[] = [];
  let pendingTools: ToolCall[] = [];
  let keyCounter = 0;

  function flushTools(): void {
    if (pendingTools.length > 0) {
      result.push({ type: "tools", tools: pendingTools, key: keyCounter++ });
      pendingTools = [];
    }
  }

  for (const block of blocks) {
    if (block.type === "tool" && block.toolCall) {
      pendingTools.push(block.toolCall);
    } else if (block.type === "todos" && block.todos) {
      flushTools();
      result.push({ type: "todos", todos: block.todos, key: keyCounter++ });
    } else {
      flushTools();
      result.push({ type: "text", block, key: keyCounter++ });
    }
  }
  flushTools();

  return result;
}

export function AssistantBlocks({ blocks }: { blocks: ContentBlock[] }) {
  const items = groupBlocksByType(blocks);
  return <>{items.map(renderBlockItem)}</>;
}
