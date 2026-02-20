import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function HomePage() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("jg_access_token")?.value;
  const userType = cookieStore.get("jg_user_type")?.value;

  if (accessToken) {
    if (userType === "job_seeker") {
      redirect("/portal");
    }
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ─── HEADER ─── */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="JobGenius" width={140} height={40} className="h-9 w-auto" priority />
            </Link>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <a href="#how-it-works" className="hover:text-gray-900 transition-colors">
                How It Works
              </a>
              <a href="#what-we-do" className="hover:text-gray-900 transition-colors">
                What We Do
              </a>
              <a href="#referral-network" className="hover:text-gray-900 transition-colors">
                Referral Network
              </a>
              <a href="#interview-prep" className="hover:text-gray-900 transition-colors">
                Interview Prep
              </a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-orange-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="pt-32 pb-20 sm:pt-40 sm:pb-28 bg-gradient-to-b from-violet-50/60 via-white to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-50 border border-violet-100 rounded-full text-sm font-medium text-violet-700 mb-8">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            Your job search team is ready
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
            Stop Applying to Jobs.
            <br />
            <span className="text-violet-600">Start Getting</span>{" "}
            <span className="text-orange-500">Hired.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            We handle the entire job search &mdash; targeted applications, direct
            recruiter outreach, and referral network access &mdash; so you can
            focus on the only thing that matters:{" "}
            <strong className="text-gray-900">nailing your interviews.</strong>
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-full text-sm text-violet-700 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Targeted Applications
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-full text-sm text-orange-700 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Referral Network Access
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-full text-sm text-violet-700 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              AI Interview Prep
            </span>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/signup"
              className="bg-orange-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-200"
            >
              Get Your Team Started
            </Link>
            <a
              href="#how-it-works"
              className="bg-white text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-colors border border-gray-200"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            No spam applications. No mass blasting. Real opportunities, managed by real people.
          </p>
        </div>
      </section>

      {/* ─── PAIN POINT STRIP ─── */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-orange-400 font-semibold text-sm uppercase tracking-wider mb-3">
            Sound familiar?
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Job searching is a full-time job. It shouldn&apos;t be.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="text-3xl mb-3">😩</div>
              <p className="text-gray-300 leading-relaxed">
                Spending <strong className="text-white">4+ hours a day</strong> applying,
                customizing cover letters, and hearing nothing back.
              </p>
            </div>
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-gray-300 leading-relaxed">
                Sending <strong className="text-white">hundreds of applications</strong> into
                the void with no strategy and no feedback.
              </p>
            </div>
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="text-3xl mb-3">😰</div>
              <p className="text-gray-300 leading-relaxed">
                Finally landing an interview but feeling
                <strong className="text-white"> unprepared</strong> and unsure what to expect.
              </p>
            </div>
          </div>
          <p className="text-center text-lg text-gray-400 mt-10">
            What if you had a team handling all of that &mdash; and you only
            showed up for interviews?
          </p>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Three steps to your next offer
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            We pair AI speed with human judgment. Your dedicated account manager
            runs your search while our AI works around the clock.
          </p>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="relative">
              <div className="w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-5">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                You tell us what you want
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Upload your resume, share your target roles, salary range, and
                preferences. Your account manager reviews everything and builds
                a personalized search strategy.
              </p>
            </div>

            <div className="relative">
              <div className="w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-5">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                We work while you don&apos;t
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Our AI finds and matches opportunities 24/7. Your account
                manager applies, reaches out to recruiters, taps the referral
                network, and manages your entire pipeline.
              </p>
            </div>

            <div className="relative">
              <div className="w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-5">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                You focus on interviews
              </h3>
              <p className="text-gray-600 leading-relaxed">
                When an interview lands, we prepare you with AI-powered coaching,
                company-specific questions, and practice sessions so you walk in
                confident and ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── WHAT WE DO FOR YOU ─── */}
      <section id="what-we-do" className="py-20 sm:py-28 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            What We Do
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Everything a job seeker needs. Nothing you have to do yourself.
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Think of us as your career team &mdash; part recruiter, part coach,
            part AI assistant &mdash; all working toward one goal: getting you hired.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              title="Targeted Applications"
              description="We don't spray and pray. AI matches you to roles where you're a strong fit, and your manager applies with tailored materials."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              }
              title="Recruiter Outreach"
              description="We contact recruiters and hiring managers directly on your behalf. Personalized messages, strategic follow-ups, real conversations."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              title="Referral Network"
              description="Get introduced to hidden roles through our peer and recruiter network — often before positions are publicly posted."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
              title="Pipeline Management"
              description="Track every opportunity from first touch to offer. Your manager keeps everything organized so nothing falls through the cracks."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
              title="Interview Preparation"
              description="Company-specific study notes, AI-generated practice questions, live voice practice, and real-time scoring to get you interview-ready."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
              title="AI + Human Intelligence"
              description="AI works 24/7 finding and scoring opportunities. Your human account manager adds strategy, judgment, and the personal touch AI can't replace."
            />
          </div>
        </div>
      </section>

      {/* ─── AI + HUMAN SECTION ─── */}
      <section className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
                The Best of Both Worlds
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                AI speed.
                <br />
                Human strategy.
              </h2>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                Other platforms give you a chatbot. We give you a dedicated
                account manager backed by AI that never sleeps.
              </p>
              <ul className="space-y-4">
                <BulletPoint text="Your account manager builds a strategy tailored to your goals, industry, and timeline" />
                <BulletPoint text="AI scans thousands of listings daily and scores each one against your profile" />
                <BulletPoint text="Your manager applies, handles recruiter outreach, and taps our referral network" />
                <BulletPoint text="You get updates in your portal, never wondering what's happening behind the scenes" />
              </ul>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-orange-50 rounded-2xl p-8 sm:p-10 border border-violet-100">
              <div className="space-y-6">
                <ComparisonRow label="Job Matching" ai="Scans 10,000+ listings/day" human="Validates fit & culture alignment" />
                <ComparisonRow label="Applications" ai="Auto-fills & optimizes materials" human="Reviews, customizes cover letters" />
                <ComparisonRow label="Recruiter Outreach" ai="Identifies contacts & drafts messages" human="Sends personalized, strategic messages" />
                <ComparisonRow label="Referral Network" ai="Matches your profile to network contacts" human="Makes warm introductions at target companies" />
                <ComparisonRow label="Interview Prep" ai="Generates questions & scores answers" human="Provides coaching & strategy advice" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTERVIEW PREP ─── */}
      <section id="interview-prep" className="py-20 sm:py-28 bg-gradient-to-b from-violet-600 to-violet-800 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-200 font-semibold text-sm uppercase tracking-wider mb-3">
            Interview Preparation
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Walk into every interview ready to win
          </h2>
          <p className="text-center text-violet-200 max-w-2xl mx-auto mb-4 text-lg">
            The interview is the one part only you can do. We make sure you&apos;re
            the most prepared candidate in the room.
          </p>
          {/* Stat callout */}
          <div className="flex justify-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2 text-sm font-medium text-white">
              <span className="text-orange-300 font-bold text-base">85%</span>
              of JobGenius candidates pass their first interview round
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Company-Specific Research</h3>
              <p className="text-violet-200 text-sm leading-relaxed">
                AI generates study notes tailored to the specific company &mdash;
                their products, culture, recent news, and what the hiring
                manager likely cares about.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Role-Specific Questions</h3>
              <p className="text-violet-200 text-sm leading-relaxed">
                Not generic &ldquo;tell me about yourself&rdquo; lists. AI reads the actual
                job description and generates the questions this interviewer
                is likely to ask.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Voice Practice with AI Scoring</h3>
              <p className="text-violet-200 text-sm leading-relaxed">
                Practice answering out loud. Our AI transcribes your answer,
                scores it on STAR structure, relevance, and specificity, and
                gives you coaching to improve.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Progress Tracking & Streaks</h3>
              <p className="text-violet-200 text-sm leading-relaxed">
                Track your readiness score, practice streaks, and score trends.
                See your confidence improve session by session with personalized
                feedback.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── REFERRAL NETWORK ─── */}
      <section id="referral-network" className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-orange-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Referral Network
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Opportunities come to you
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16 text-lg">
            Most job seekers compete on job boards against thousands of applicants.
            Our referral network gives you a different path entirely &mdash; often
            before a role is even posted publicly.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Company Partnerships</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                We work directly with companies looking to hire. When a role matches
                your profile, we get you in front of them before it hits the job boards.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Recruiter Network</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                Our growing network of recruiters and staffing partners means more
                doors open for you. When they have an opening, they come to us first.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Opportunity Alerts</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                When a network opportunity surfaces that matches your profile, we move
                fast. You get notified and prepped before anyone else.
              </p>
            </div>
          </div>

          {/* Referral success story */}
          <div className="bg-gradient-to-br from-orange-50 to-violet-50 rounded-2xl p-8 border border-orange-100 text-center max-w-2xl mx-auto">
            <p className="text-gray-700 text-lg italic mb-4">
              &ldquo;I got introduced to a company through their recruiter network that I never
              would have found on LinkedIn. That&apos;s where I ended up getting my offer.&rdquo;
            </p>
            <p className="text-sm font-semibold text-gray-900">Priya R. &mdash; Data Analyst</p>
            <p className="text-xs text-violet-600 font-medium mt-1">Hired in 5 weeks via referral</p>
          </div>
        </div>
      </section>

      {/* ─── FOR PEERS & RECRUITERS ─── */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Join the Network
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Not just for job seekers
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Peers and recruiters are a core part of how JobGenius works &mdash;
            and there&apos;s something in it for you too.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* For Peers */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 flex flex-col">
              <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 mb-5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">For Peers</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Know someone who&apos;s job searching? Refer them to JobGenius and earn a
                reward when they land an offer. Help your network get hired faster with
                expert support behind them.
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                <BulletPoint text="Easy referral link to share with your network" />
                <BulletPoint text="Earn a reward for every successful placement" />
                <BulletPoint text="Your referral gets a dedicated account manager, not a bot" />
              </ul>
              <Link
                href="/signup"
                className="inline-block text-center bg-white text-violet-700 px-6 py-3 rounded-xl font-semibold border-2 border-violet-600 hover:bg-violet-50 transition-colors"
              >
                Refer a Friend
              </Link>
            </div>

            {/* For Recruiters */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 flex flex-col">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 mb-5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">For Recruiters</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Partner with us to access a pipeline of pre-screened, interview-ready
                candidates matched to your open roles. Our account managers know
                every candidate personally.
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                <BulletPoint text="AI-matched candidates specific to your open roles" />
                <BulletPoint text="Every candidate is interview-prepped and application-ready" />
                <BulletPoint text="Work with an account manager who knows the candidate's strengths" />
              </ul>
              <a
                href="mailto:partners@jobgenius.com"
                className="inline-block text-center bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
              >
                Become a Partner
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section className="py-16 bg-white border-y border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-violet-600">3-5x</div>
              <div className="text-sm font-medium text-gray-700 mt-1">Faster Placement</div>
              <div className="text-xs text-gray-400 mt-0.5">via referral network</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-violet-600">85%</div>
              <div className="text-sm font-medium text-gray-700 mt-1">Interview Pass Rate</div>
              <div className="text-xs text-gray-400 mt-0.5">with AI prep coaching</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-orange-500">0hrs</div>
              <div className="text-sm font-medium text-gray-700 mt-1">You Spend Applying</div>
              <div className="text-xs text-gray-400 mt-0.5">we handle everything</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-violet-600">24/7</div>
              <div className="text-sm font-medium text-gray-700 mt-1">AI Working For You</div>
              <div className="text-xs text-gray-400 mt-0.5">while you sleep</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Invest in your career. We&apos;ll deliver the results.
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Two plans, both include a dedicated account manager, referral network access,
            and our full AI engine. You only pay a success fee when you land an offer.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Tier 1 — Essentials */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-8 flex flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">Essentials</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Full job search management
                </p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-gray-900">$500</span>
                <span className="text-gray-500 ml-1">one-time</span>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-6">
                <p className="text-sm font-medium text-orange-700">
                  + 5% of first-year salary upon successful offer
                </p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingItem included text="Dedicated human account manager" />
                <PricingItem included text="AI-powered job matching & scoring" />
                <PricingItem included text="Targeted applications on your behalf" />
                <PricingItem included text="Recruiter outreach & follow-ups" />
                <PricingItem included text="Full pipeline management & tracking" />
                <PricingItem included text="Referral network access" />
                <PricingItem included text="Portal with real-time updates" />
                <PricingItem included={false} text="AI interview preparation" />
                <PricingItem included={false} text="Voice practice with AI scoring" />
                <PricingItem included={false} text="Skill polishing & coaching" />
              </ul>
              <Link
                href="/signup"
                className="block text-center bg-white text-violet-700 px-6 py-3 rounded-xl font-semibold border-2 border-violet-600 hover:bg-violet-50 transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Tier 2 — Premium */}
            <div className="bg-gradient-to-b from-violet-600 to-violet-700 rounded-2xl p-8 text-white flex flex-col relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold">Premium</h3>
                <p className="text-sm text-violet-200 mt-1">
                  Full access including interview prep
                </p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold">$1,000</span>
                <span className="text-violet-200 ml-1">one-time</span>
              </div>
              <div className="bg-white/15 border border-white/20 rounded-lg px-4 py-2.5 mb-6">
                <p className="text-sm font-medium text-orange-300">
                  + 5% of first-year salary upon successful offer
                </p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingItem included light text="Dedicated human account manager" />
                <PricingItem included light text="AI-powered job matching & scoring" />
                <PricingItem included light text="Targeted applications on your behalf" />
                <PricingItem included light text="Recruiter outreach & follow-ups" />
                <PricingItem included light text="Full pipeline management & tracking" />
                <PricingItem included light text="Referral network access" />
                <PricingItem included light text="Portal with real-time updates" />
                <PricingItem included light text="AI interview preparation" />
                <PricingItem included light text="Voice practice with AI scoring" />
                <PricingItem included light text="Skill polishing & coaching" />
              </ul>
              <Link
                href="/signup"
                className="block text-center bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors shadow-lg"
              >
                Get Started
              </Link>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400 mt-8">
            The success fee is only charged when you accept an offer. No offer, no fee.
          </p>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            What Job Seekers Say
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-16">
            People who stopped job searching
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="I was spending 5 hours a day applying to jobs. Now I spend zero. My account manager handles everything and I just show up to interviews feeling prepared."
              name="Sarah K."
              role="Product Manager"
              result="Hired in 6 weeks"
            />
            <TestimonialCard
              quote="The interview prep alone is worth it. The AI scored my practice answers and told me exactly what to fix. I walked into my final round and nailed it."
              name="Marcus T."
              role="Software Engineer"
              result="Hired in 4 weeks"
            />
            <TestimonialCard
              quote="I got introduced to a company through their recruiter network that I never would have found on LinkedIn. That's where I ended up getting my offer."
              name="Priya R."
              role="Data Analyst"
              result="Hired in 5 weeks via referral"
            />
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-20 sm:py-28 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to stop searching and start getting hired?
          </h2>
          <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
            Your dedicated team is ready. AI working around the clock. Referral network
            access from day one. Interview prep that actually works.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
            <Link
              href="/signup"
              className="inline-block bg-orange-500 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-900/30 hover:shadow-xl"
            >
              Get Started Today
            </Link>
            <a
              href="#referral-network"
              className="inline-block bg-white/10 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Learn About Referrals
            </a>
          </div>
          <p className="text-sm text-gray-500">
            No lock-in contracts. Success fee only on accepted offers.
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-gray-950 text-gray-400 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="grid sm:grid-cols-3 gap-8 mb-10">
            <div>
              <div className="mb-4">
                <Image src="/logo.png" alt="JobGenius" width={120} height={36} className="h-8 w-auto brightness-200" />
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered job search managed by real people. We handle the
                applications, referral network, and interview prep so you can
                focus on getting hired.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Platform
              </h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#what-we-do" className="hover:text-white transition-colors">What We Do</a></li>
                <li><a href="#referral-network" className="hover:text-white transition-colors">Referral Network</a></li>
                <li><a href="#interview-prep" className="hover:text-white transition-colors">Interview Prep</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Get Started
              </h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/signup" className="hover:text-white transition-colors">Create Account</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
                <li><a href="mailto:partners@jobgenius.com" className="hover:text-white transition-colors">Recruiter Partnership</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            &copy; {new Date().getFullYear()} JobGenius. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── SUB-COMPONENTS ─── */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 hover:border-violet-100 hover:shadow-md transition-all">
      <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg
        className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span className="text-gray-600">{text}</span>
    </li>
  );
}

function ComparisonRow({
  label,
  ai,
  human,
}: {
  label: string;
  ai: string;
  human: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <span className="text-gray-700">{ai}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-orange-400 mt-0.5 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          <span className="text-gray-700">{human}</span>
        </div>
      </div>
    </div>
  );
}

function PricingItem({
  included,
  text,
  light,
}: {
  included: boolean;
  text: string;
  light?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      {included ? (
        <svg
          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${light ? "text-orange-300" : "text-violet-600"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}
      <span className={light ? "text-violet-100" : included ? "text-gray-700" : "text-gray-400"}>
        {text}
      </span>
    </li>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
  result,
}: {
  quote: string;
  name: string;
  role: string;
  result: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-1 mb-4 text-orange-400">
        {[...Array(5)].map((_, i) => (
          <svg key={i} className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="text-gray-700 text-sm leading-relaxed mb-4">
        &ldquo;{quote}&rdquo;
      </p>
      <div>
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{role}</p>
        <p className="text-xs font-medium text-violet-600 mt-1">{result}</p>
      </div>
    </div>
  );
}
