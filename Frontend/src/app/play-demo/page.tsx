import Link from 'next/link'

const PlayDemoPage = () => {
  const webglEmbedUrl = process.env.NEXT_PUBLIC_WEBGL_EMBED_URL

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-6xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            WebGL Demo
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Placeholder structure for embedding the itch.io or hosted WebGL build. Configure
            `NEXT_PUBLIC_WEBGL_EMBED_URL` to load the live demo URL.
          </p>

          <div className="mx-auto mt-8 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b] shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
            <div className="aspect-video w-full">
              {webglEmbedUrl ? (
                <iframe
                  src={webglEmbedUrl}
                  title="AI Chat Game WebGL Demo"
                  className="h-full w-full"
                  loading="lazy"
                  allow="fullscreen; gamepad; autoplay"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                  <p className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white">WebGL Embed Placeholder</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                    Set `NEXT_PUBLIC_WEBGL_EMBED_URL` in your environment to load the actual game build in this frame.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/download"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Go to download and purchase options"
            >
              Get Full Version
            </Link>
            <Link
              href="/characters"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md border border-white/20 px-6 text-xs font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200"
              aria-label="Browse characters"
            >
              Browse Characters
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default PlayDemoPage
