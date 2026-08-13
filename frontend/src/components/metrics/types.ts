/** The `/api/metrics` payload. Mirrors `backend/app/routers/metrics.py`. */

export interface WeekCount {
  /** The Monday the week starts on, ISO. */
  week: string;
  signups: number;
}

export interface AssistantHealth {
  answers: number;
  out_of_index_refusals: number;
  /** Null when the assistant has answered nothing: unknown, not zero. */
  out_of_index_share: number | null;
}

export interface MetricsPayload {
  weeks: number;
  signups_per_week: WeekCount[];
  signups_total: number;
  users_total: number;
  questions_asked: number;
  saved_chats: number;
  returning_users: number;
  assistant: AssistantHealth;
}
