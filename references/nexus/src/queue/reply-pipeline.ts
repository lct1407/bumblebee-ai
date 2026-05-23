import type { ChannelPlugin } from "../channel/types.js";
import type { StreamEvent } from "../agent/provider.js";
import { chunkText } from "../channel/chunker.js";

export class ReplyPipeline {
  async deliver(
    channelPlugin: ChannelPlugin,
    to: string,
    text: string,
  ): Promise<void> {
    const chunks = chunkText(text, channelPlugin.capabilities.maxChunkSize);
    for (const chunk of chunks) {
      await channelPlugin.send(to, chunk);
    }
  }

  async deliverStream(
    channelPlugin: ChannelPlugin,
    to: string,
    events: AsyncIterable<StreamEvent>,
    opts?: { typingInterval?: number },
  ): Promise<string> {
    const maxSize = channelPlugin.capabilities.maxChunkSize;
    const typingInterval = opts?.typingInterval ?? 3000;
    let buffer = "";
    let full = "";
    let lastTyping = 0;

    const sendTyping = async () => {
      if (!channelPlugin.sendTyping) return;
      const now = Date.now();
      if (now - lastTyping >= typingInterval) {
        lastTyping = now;
        await channelPlugin.sendTyping(to);
      }
    };

    const flushBuffer = async () => {
      if (!buffer) return;
      const chunks = chunkText(buffer, maxSize);
      for (const chunk of chunks) {
        await channelPlugin.send(to, chunk);
      }
      buffer = "";
    };

    for await (const event of events) {
      if (event.type === "text_delta") {
        buffer += event.text;
        full += event.text;
        await sendTyping();
        if (buffer.length >= maxSize) {
          await flushBuffer();
        }
      } else if (event.type === "text_end" || event.type === "message_end") {
        await flushBuffer();
      }
    }

    await flushBuffer();
    return full;
  }
}
