import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-xl bg-[#0a0908]/70 border-b border-[#2a2720]">
      <span className="text-xl font-serif text-amber-400 tracking-tight">Forge</span>
      <div className="flex items-center gap-6">
        <a href="#features" className="text-sm text-[#9c9588] hover:text-[#f0ebe3] transition-colors hidden sm:block">Features</a>
        <a href="#how-it-works" className="text-sm text-[#9c9588] hover:text-[#f0ebe3] transition-colors hidden sm:block">How It Works</a>
        <a href="#architecture" className="text-sm text-[#9c9588] hover:text-[#f0ebe3] transition-colors hidden sm:block">Architecture</a>
        <Link href="/login" className="text-sm text-[#9c9588] hover:text-[#f0ebe3] transition-colors">Log in</Link>
        <Link href="/register" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-400 transition-colors shadow-[0_0_0_1px_rgba(249,115,22,0.3),0_4px_24px_rgba(249,115,22,0.2)]">
          Get Started
        </Link>
      </div>
    </nav>
  );
}
