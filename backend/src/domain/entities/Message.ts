export const MESSAGE_ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
  SYSTEM: 'system',
} as const;

export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MessageProps {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCallRecord[] | null;
  toolCallId: string | null;
  createdAt: Date;
}

export class Message {
  public readonly id: string;
  public readonly conversationId: string;
  public readonly role: MessageRole;
  public readonly content: string;
  public readonly toolCalls: ToolCallRecord[] | null;
  public readonly toolCallId: string | null;
  public readonly createdAt: Date;

  constructor(props: MessageProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.role = props.role;
    this.content = props.content;
    this.toolCalls = props.toolCalls;
    this.toolCallId = props.toolCallId;
    this.createdAt = props.createdAt;
  }
}
