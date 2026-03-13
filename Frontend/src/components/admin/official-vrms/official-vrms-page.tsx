import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminOfficialVrmRow, { type AdminOfficialVrmRecord } from '@/components/ui-elements/admin-official-vrm-row'

const officialVrmRecordList: AdminOfficialVrmRecord[] = [
  {
    id: '1',
    code: 'O-001',
    name: 'Airi Akizuki',
    tagline: 'Easily Seduced',
    hearts: '24.5K',
    chats: '112K',
    status: 'published',
    releaseDate: '2025-01-15'
  },
  {
    id: '2',
    code: 'O-002',
    name: 'Yuki Snow',
    tagline: 'Ice Queen',
    hearts: '0',
    chats: '0',
    status: 'draft',
    releaseDate: 'Unreleased'
  },
  {
    id: '3',
    code: 'O-003',
    name: 'Sakura Blaze',
    tagline: 'Fiery Ninja',
    hearts: '18.2K',
    chats: '89K',
    status: 'published',
    releaseDate: '2025-06-20'
  }
]

const PlusIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5.2v13.6M5.2 12h13.6" strokeLinecap="round" />
    </svg>
  )
}

const OfficialVrmsPage = () => {
  return (
    <AdminPageShell activeKey="official-vrms">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Official Characters</h1>
          <p className="mt-1 text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ab0cd]">
            Manage and publish official, curated VRMs produced by the platform.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-ember-300 to-ember-400 px-6 text-[12px] font-normal uppercase tracking-[0.05em] text-[#1b130f] transition hover:brightness-105"
          aria-label="Add official VRM"
        >
          <PlusIcon />
          Add Official VRM
        </button>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Character</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Tagline / Title</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Metrics</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Release Date</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {officialVrmRecordList.map((vrmRecord) => (
                <AdminOfficialVrmRow key={vrmRecord.id} vrmRecord={vrmRecord} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default OfficialVrmsPage
