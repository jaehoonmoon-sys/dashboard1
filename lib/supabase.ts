import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export type RiskAssignment = {
  id: number;
  evaluation_id: number | null;
  student_name: string;
  cohort: string | null;
  chapter: string | null;
  risk_type: "nps_low" | "ops_low" | "peer_low" | "self_peer_gap" | "multi";
  risk_score: number | null;
  assigned_role: "운영기획매니저" | "학습관리매니저" | "튜터";
  status: "pending" | "in_progress" | "completed";
  reason: string | null;
  created_at: string;
};

export type InterviewStat = {
  student_name: string;
  interview_count: number;
  last_interview_date: string | null;
  all_interview_types: string[] | null;
};
