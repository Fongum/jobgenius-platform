-- Migration: Skill-Up (Learning) Module
-- Creates learning tracks, lessons, progress, bookmarks, and notes tables

-- Learning tracks created by AM for a seeker
CREATE TABLE IF NOT EXISTS public.learning_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  account_manager_id uuid NOT NULL REFERENCES public.account_managers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('technical', 'behavioral', 'industry', 'tools', 'general')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  sort_order integer DEFAULT 0,
  job_post_id uuid REFERENCES public.job_posts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_tracks_seeker ON public.learning_tracks(job_seeker_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_tracks_am ON public.learning_tracks(account_manager_id);

-- Individual lessons within a track
CREATE TABLE IF NOT EXISTS public.learning_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.learning_tracks(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'article'
    CHECK (content_type IN ('article', 'video', 'exercise', 'quiz', 'resource_link')),
  content jsonb NOT NULL DEFAULT '{}',
  sort_order integer DEFAULT 0,
  estimated_minutes integer DEFAULT 10,
  is_ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_lessons_track ON public.learning_lessons(track_id, sort_order);

-- Seeker's progress through lessons
CREATE TABLE IF NOT EXISTS public.learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  time_spent_seconds integer DEFAULT 0,
  quiz_score integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_seeker_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_progress_seeker ON public.learning_progress(job_seeker_id, status);

-- Seeker bookmarks
CREATE TABLE IF NOT EXISTS public.learning_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_seeker_id, lesson_id)
);

-- Personal notes on lessons
CREATE TABLE IF NOT EXISTS public.learning_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_notes_seeker_lesson ON public.learning_notes(job_seeker_id, lesson_id);

-- ===== RLS Policies =====

-- Learning tracks
ALTER TABLE public.learning_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_learning_tracks" ON public.learning_tracks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_view_own_tracks" ON public.learning_tracks
  FOR SELECT USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    ) AND status = 'published'
  );

CREATE POLICY "am_manage_assigned_tracks" ON public.learning_tracks
  FOR ALL USING (
    account_manager_id IN (
      SELECT am.id FROM public.account_managers am WHERE am.auth_id = auth.uid()
    )
  );

-- Learning lessons
ALTER TABLE public.learning_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_learning_lessons" ON public.learning_lessons
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_view_lessons" ON public.learning_lessons
  FOR SELECT USING (
    track_id IN (
      SELECT lt.id FROM public.learning_tracks lt
      JOIN public.job_seekers js ON lt.job_seeker_id = js.id
      WHERE js.auth_id = auth.uid() AND lt.status = 'published'
    )
  );

CREATE POLICY "am_manage_lessons" ON public.learning_lessons
  FOR ALL USING (
    track_id IN (
      SELECT lt.id FROM public.learning_tracks lt
      JOIN public.account_managers am ON lt.account_manager_id = am.id
      WHERE am.auth_id = auth.uid()
    )
  );

-- Learning progress
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_learning_progress" ON public.learning_progress
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_progress" ON public.learning_progress
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );

-- Learning bookmarks
ALTER TABLE public.learning_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_learning_bookmarks" ON public.learning_bookmarks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_bookmarks" ON public.learning_bookmarks
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );

-- Learning notes
ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_learning_notes" ON public.learning_notes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "seekers_manage_notes" ON public.learning_notes
  FOR ALL USING (
    job_seeker_id IN (
      SELECT js.id FROM public.job_seekers js WHERE js.auth_id = auth.uid()
    )
  );
