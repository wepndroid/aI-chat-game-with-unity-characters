'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'

const ProfilePage = () => {
  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_0%,rgba(244,99,19,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Profile
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="profile" />

            <div className="rounded-md border border-white/10 bg-[#1a1414]/95 p-6 md:p-10">
              <h2 className="font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">reKengator2</h2>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Member Since Feb 2025</p>

              <button
                type="button"
                className="mt-12 inline-flex h-12 min-w-[250px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
                aria-label="Connect Patreon account"
              >
                Connect With Patreon o
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ProfilePage
