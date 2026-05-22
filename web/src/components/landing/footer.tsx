export function Footer() {
  return (
    <footer className="bg-zinc-950 text-zinc-400 py-12 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-xl">
              🐝 bumblebee-ai
            </div>
            <p className="mt-2 text-sm">Multi-agent concurrent task management.</p>
            <p className="mt-1 text-xs text-zinc-600">MIT • v0.4.0</p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-amber-400">Features</a></li>
              <li><a href="#architecture" className="hover:text-amber-400">Architecture</a></li>
              <li><a href="#use-cases" className="hover:text-amber-400">Use Cases</a></li>
              <li><a href="#quickstart" className="hover:text-amber-400">Quick Start</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Developers</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://pypi.org/project/bumblebee-ai/" target="_blank" rel="noreferrer" className="hover:text-amber-400">PyPI Package</a></li>
              <li><a href="https://github.com/lct1407/bumblebee" target="_blank" rel="noreferrer" className="hover:text-amber-400">GitHub</a></li>
              <li><a href="/dashboard" className="hover:text-amber-400">Dashboard</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://github.com/lct1407/bumblebee/blob/master/docs/plan.md" target="_blank" rel="noreferrer" className="hover:text-amber-400">Plan v1.1.1</a></li>
              <li><a href="https://github.com/lct1407/bumblebee/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer" className="hover:text-amber-400">Changelog</a></li>
              <li><a href="https://github.com/lct1407/bumblebee/blob/master/LICENSE" target="_blank" rel="noreferrer" className="hover:text-amber-400">License (MIT)</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-zinc-900 flex flex-col sm:flex-row justify-between gap-4 text-xs text-zinc-600">
          <div>© 2026 Thanh Le Cong. Released under the MIT License.</div>
          <div>Built with Next.js, Tailwind, FastAPI, LangGraph, PostgreSQL.</div>
        </div>
      </div>
    </footer>
  );
}
