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
  timestamp: Date;
}

export interface ChatSource {
  document_id: string;
  document_title: string;
  chunk_id: string;
  excerpt: string;
  page: number;
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
