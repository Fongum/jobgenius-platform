import ScrollReveal from "../ScrollReveal";

export default function StatsSection() {
  return (
    <section className="py-20 bg-violet-700 text-white">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-300 font-semibold text-sm uppercase tracking-wider mb-12">
            The numbers behind our results
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "3\u20135\u00d7", label: "Faster Placement", sub: "vs. job-searching alone" },
              { value: "85%", label: "Interview Pass Rate", sub: "with AI prep coaching" },
              { value: "0 hrs", label: "You Spend Applying", sub: "we handle everything" },
              { value: "24/7", label: "AI Working For You", sub: "while you sleep" },
            ].map((stat) => (
              <div key={stat.label} className="group">
                <div className="text-4xl sm:text-5xl font-extrabold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-sm font-semibold text-violet-100 mt-1">{stat.label}</div>
                <div className="text-xs text-violet-300 mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
