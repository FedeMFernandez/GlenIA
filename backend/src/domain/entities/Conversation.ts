export interface ConversationProps {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  public readonly id: string;
  public readonly title: string | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: ConversationProps) {
    this.id = props.id;
    this.title = props.title;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
