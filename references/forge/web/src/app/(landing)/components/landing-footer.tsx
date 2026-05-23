export function LandingFooter() {
  return (
    <footer className="border-t border-[#2a2720] max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <span className="font-serif text-lg text-amber-400">Forge</span>
        <span className="ml-3 text-xs text-[#6b655c]">&copy; 2026. Built with fire.</span>
      </div>
      <div className="flex gap-5">
        <a href="#" className="text-xs text-[#6b655c] hover:text-[#9c9588] transition-colors">Documentation</a>
        <a href="#" className="text-xs text-[#6b655c] hover:text-[#9c9588] transition-colors">GitHub</a>
        <a href="#" className="text-xs text-[#6b655c] hover:text-[#9c9588] transition-colors">Discord</a>
      </div>
    </footer>
  );
}
