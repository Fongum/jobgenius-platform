import ScrollReveal from "../ScrollReveal";
import { StarIcon } from "../icons";

function TestimonialCard({
  quote,
  name,
  role,
  result,
  initials,
  avatarColor,
}: {
  quote: string;
  name: string;
  role: string;
  result: string;
  initials: string;
  avatarColor: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-1 mb-4 text-orange-400">
        {[...Array(5)].map((_, i) => (
          <StarIcon key={i} className="w-4 h-4 fill-current" />
        ))}
      </div>
      <p className="text-gray-700 text-sm leading-relaxed mb-5">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarColor}`}>
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
          <p className="text-xs font-medium text-violet-600 mt-0.5">{result}</p>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-28 bg-gray-50">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            What Job Seekers Say
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-14">
            People who stopped job searching
          </h2>

          {/* Featured testimonial */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 sm:p-10 mb-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-orange-500 rounded-l-2xl" />
            <div className="flex items-center gap-1 mb-5 text-orange-400">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="w-5 h-5 fill-current" />
              ))}
            </div>
            <p className="text-gray-800 text-xl sm:text-2xl font-medium leading-relaxed mb-6">
              &ldquo;I was spending 5 hours a day applying to jobs. Now I spend zero. My account
              manager handles everything and I just show up to interviews feeling prepared.&rdquo;
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                SK
              </div>
              <div>
                <p className="font-semibold text-gray-900">Sarah K.</p>
                <p className="text-sm text-gray-500">Product Manager</p>
                <p className="text-sm font-medium text-violet-600 mt-0.5">Hired in 6 weeks</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <TestimonialCard
              quote="The interview prep alone is worth it. The AI scored my practice answers and told me exactly what to fix. I walked into my final round and nailed it."
              name="Marcus T."
              role="Software Engineer"
              result="Hired in 4 weeks"
              initials="MT"
              avatarColor="bg-orange-500"
            />
            <TestimonialCard
              quote="I got introduced to a company through their recruiter network that I never would have found on LinkedIn. That's where I ended up getting my offer."
              name="Priya R."
              role="Data Analyst"
              result="Hired in 5 weeks via referral"
              initials="PR"
              avatarColor="bg-emerald-500"
            />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
