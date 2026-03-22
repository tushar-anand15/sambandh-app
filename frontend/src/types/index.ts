export interface User {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Document {
  id: string;
  title: string;
  project_no: string;
  district: string;
  lb_name: string;
  lb_type: string;
  year: string;
  page_count: number | null;
  file_size_bytes: number | null;
  chunks: Chunk[];
}

export interface Chunk {
  id: string;
  chunk_type: "kv" | "narrative" | "table_schema" | "table_rows" | "table_summary";
  section_path: string[];
  display_text: string;
  search_text: string;
  page_start: number;
  page_end: number;
  metadata: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  toolCalls?: ToolCallEvent[];
  isStreaming?: boolean;
  timestamp: Date;
}

export interface ChatSource {
  document_id: string;
  document_title: string;
  chunk_id: string;
  excerpt: string;
  page: number;
  lb_name?: string;
  score?: number;
}

export interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  outputSummary?: string;
  status: "running" | "done";
}

export type ViewerTab = "text" | "chunks" | "metadata";

export interface DocResult {
  id: string;
  title: string;
  project_no: string | null;
  district: string | null;
  lb_name: string | null;
  lb_type: string | null;
  year: string | null;
  page_count: number | null;
}

// Chat history types
export interface ChatSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatDetail {
  id: string;
  title: string | null;
  messages: ChatMessageResponse[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  tool_calls: ToolCallEvent[] | null;
  created_at: string;
}

export interface ChatsListResponse {
  chats: ChatSummary[];
  total: number;
}
