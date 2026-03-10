import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-14">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div className="grid sm:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-1">
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
            <ul className="space-y-2.5 text-sm">
              <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
              <li><a href="#what-we-do" className="hover:text-white transition-colors">What We Do</a></li>
              <li><a href="#referral-network" className="hover:text-white transition-colors">Referral Network</a></li>
              <li><a href="#interview-prep" className="hover:text-white transition-colors">Interview Prep</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Get Started
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/signup" className="hover:text-white transition-colors">Create Account</Link></li>
              <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
              <li><a href="mailto:partners@jobgenius.com" className="hover:text-white transition-colors">Recruiter Partnership</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Company
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href="mailto:hello@jobgenius.com" className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="mailto:partners@jobgenius.com" className="hover:text-white transition-colors">Partnerships</a></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm">
          <span>&copy; {new Date().getFullYear()} JobGenius. All rights reserved.</span>
          <span className="text-gray-600">AI-powered job search &middot; Human-led execution</span>
        </div>
      </div>
    </footer>
  );
}
