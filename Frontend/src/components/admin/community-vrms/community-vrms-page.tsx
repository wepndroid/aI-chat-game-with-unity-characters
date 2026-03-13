'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminCommunityVrmRow, { type AdminCommunityVrmRecord } from '@/components/ui-elements/admin-community-vrm-row'
import type { AdminVrmVisibilityStatus } from '@/components/ui-elements/admin-vrm-status-pill'
import { useMemo, useState } from 'react'

const allCommunityVrmRecords: AdminCommunityVrmRecord[] = [
  { id: '1', code: 'V-8821', name: 'Airi Akizuki', uploader: 'AdminSenpai', hearts: 2400, chats: 1300, status: 'public' },
  { id: '2', code: 'V-8822', name: 'Cyberpunk Lucy', uploader: 'reKengator2', hearts: 892, chats: 450, status: 'public' },
  { id: '3', code: 'V-8823', name: 'Test Dummy', uploader: 'Weeblord99', hearts: 0, chats: 2, status: 'private' },
  { id: '4', code: 'V-8824', name: 'RuleBreaker101', uploader: 'TrollAccountXX', hearts: 12, chats: 55, status: 'removed' }
]

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const statusFilterOptions: Array<{ value: 'all' | AdminVrmVisibilityStatus; label: string }> = [
  { value: 'all', label: 'All Status' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'removed', label: 'Removed' }
]

const CommunityVrmsPage = () => {
  const [statusFilter, setStatusFilter] = useState<'all' | AdminVrmVisibilityStatus>('all')
  const [searchValue, setSearchValue] = useState('')

  const filteredCommunityVrmRecords = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return allCommunityVrmRecords.filter((vrmRecord) => {
      if (statusFilter !== 'all' && vrmRecord.status !== statusFilter) {
        return false
      }

      if (normalizedSearchValue.length === 0) {
        return true
      }

      return (
        vrmRecord.name.toLowerCase().includes(normalizedSearchValue) ||
        vrmRecord.code.toLowerCase().includes(normalizedSearchValue) ||
        vrmRecord.uploader.toLowerCase().includes(normalizedSearchValue)
      )
    })
  }, [searchValue, statusFilter])

  const handleStatusFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as 'all' | AdminVrmVisibilityStatus)
  }

  const handleSearchValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
  }

  return (
    <AdminPageShell activeKey="community-vrms">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">VRM Database</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="inline-flex h-11 items-center rounded-lg border border-ember-500/55 bg-[#12151b] px-3">
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              aria-label="Filter community VRMs by status"
              className="h-full bg-transparent text-base text-[#9cb0cc] outline-none"
            >
              {statusFilterOptions.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value} className="bg-[#10151d] text-[#9cb0cc]">
                  {statusOption.label}
                </option>
              ))}
            </select>
          </label>

          <label className="group inline-flex h-11 w-full max-w-[300px] items-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-[#6e809d] transition focus-within:border-ember-300 sm:w-[300px]">
            <span aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchValue}
              onChange={handleSearchValueChange}
              placeholder="Search VRMs..."
              aria-label="Search community VRMs"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#7585a1]"
            />
          </label>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">ID / Name</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Uploader</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Metrics</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCommunityVrmRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No community VRMs match your filters.
                  </td>
                </tr>
              ) : (
                filteredCommunityVrmRecords.map((vrmRecord) => <AdminCommunityVrmRow key={vrmRecord.id} vrmRecord={vrmRecord} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default CommunityVrmsPage
