-- Migration: Enhanced Interview Prep Module
-- Creates quiz, Q&A cards, voice interview session tables

-- Quiz sessions (MCQ) linked to an interview prep
CREATE TABLE IF NOT EXISTS public.interview_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_prep_id uuid NOT NULL REFERENCES public.interview_prep(id) ON DELETE CASCADE,
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  title text NOT NULL,
  quiz_type text NOT NULL DEFAULT 'general'
    CHECK (quiz_type IN ('technical', 'behavioral', 'company', 'general')),
  questions jsonb NOT NULL DEFAULT '[]',
  total_questions integer NOT NULL DEFAULT 0,
  correct_count integer DEFAULT 0,
  score integer,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  time_limit_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_quizzes_prep ON public.interview_quizzes(interview_prep_id);
CREATE INDEX IF NOT EXISTS idx_interview_quizzes_seeker ON public.interview_quizzes(job_seeker_id, created_at DESC);

-- Q&A Bank: structured interview question cards
CREATE TABLE IF NOT EXISTS public.interview_qa_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_prep_id uuid NOT NULL REFERENCES public.interview_prep(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('behavioral', 'technical', 'situational', 'company', 'general')),
  question text NOT NULL,
  model_answer text NOT NULL,
  key_points text[] DEFAULT '{}',
  tips text,
  difficulty text DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  sort_order integer DEFAULT 0,
  is_ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_cards_prep ON public.interview_qa_cards(interview_prep_id, category);

-- Seeker's saved answers for Q&A cards
CREATE TABLE IF NOT EXISTS public.interview_qa_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_card_id uuid NOT NULL REFERENCES public.interview_qa_cards(id) ON DELETE CASCADE,
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  user_answer text NOT NULL,
  ai_feedback text,
  score integer,
  is_starred boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(qa_card_id, job_seeker_id)
);

-- Voice interview simulator sessions
CREATE TABLE IF NOT EXISTS public.voice_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_prep_id uuid NOT NULL REFERENCES public.interview_prep(id) ON DELETE CASCADE,
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  interviewer_persona text DEFAULT 'professional'
    CHECK (interviewer_persona IN ('professional', 'technical', 'behavioral', 'stress')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  total_turns integer DEFAULT 0,
  overall_score integer,
  overall_feedback text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_prep ON public.voice_interview_sessions(interview_prep_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_seeker ON public.voice_interview_sessions(job_seeker_id, created_at DESC);

-- Individual turns in a voice interview
CREATE TABLE IF NOT EXISTS public.voice_interview_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.voice_interview_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  speaker text NOT NULL
    CHECK (speaker IN ('interviewer', 'candidate')),
  content text NOT NULL,
  audio_url text,
  score integer,
  feedback text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_turns_session ON public.voice_interview_turns(session_id, turn_number);

-- ===== RLS Policies =====

-- Interview quizzes
ALTER TABLE public.interview_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_interview_quizzes" ON public.interview_quizzes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_quizzes" ON public.interview_quizzes
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );

-- Q&A cards
ALTER TABLE public.interview_qa_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_qa_cards" ON public.interview_qa_cards
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_view_qa_cards" ON public.interview_qa_cards
  FOR SELECT USING (
    interview_prep_id IN (
      SELECT ip.id FROM public.interview_prep ip
      JOIN public.job_seekers js ON ip.job_seeker_id = js.id
      WHERE js.auth_id = auth.uid()
    )
  );

CREATE POLICY "am_manage_qa_cards" ON public.interview_qa_cards
  FOR ALL USING (
    interview_prep_id IN (
      SELECT ip.id FROM public.interview_prep ip
      JOIN public.job_seeker_assignments jsa ON ip.job_seeker_id = jsa.job_seeker_id
      JOIN public.account_managers am ON jsa.account_manager_id = am.id
      WHERE am.auth_id = auth.uid()
    )
  );

-- Q&A responses
ALTER TABLE public.interview_qa_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_qa_responses" ON public.interview_qa_responses
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_qa_responses" ON public.interview_qa_responses
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );

-- Voice sessions
ALTER TABLE public.voice_interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_voice_sessions" ON public.voice_interview_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_voice_sessions" ON public.voice_interview_sessions
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );

-- Voice turns
ALTER TABLE public.voice_interview_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_voice_turns" ON public.voice_interview_turns
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_view_voice_turns" ON public.voice_interview_turns
  FOR SELECT USING (
    session_id IN (
      SELECT vs.id FROM public.voice_interview_sessions vs
      JOIN public.job_seekers js ON vs.job_seeker_id = js.id
      WHERE js.auth_id = auth.uid()
    )
  );
