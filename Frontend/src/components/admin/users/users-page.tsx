'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminUserTableRow, { type AdminUserTableRecord } from '@/components/ui-elements/admin-user-table-row'
import { useMemo, useState } from 'react'

const allUserRecords: AdminUserTableRecord[] = [
  { id: '1', username: 'Weeblord99', email: 'weeb@example.com', role: 'user', status: 'active', uploads: 4, joined: '2025-10-12' },
  { id: '2', username: 'reKengator2', email: 'reken@example.com', role: 'creator', status: 'active', uploads: 12, joined: '2025-11-05' },
  { id: '3', username: 'TrollAccountXX', email: 'troll@example.com', role: 'user', status: 'banned', uploads: 0, joined: '2026-01-20' },
  { id: '4', username: 'AdminSenpai', email: 'admin@secretwaifu.com', role: 'admin', status: 'active', uploads: 105, joined: '2025-01-01' },
  { id: '5', username: 'AiriLover7', email: 'airi7@example.com', role: 'user', status: 'active', uploads: 2, joined: '2025-12-18' },
  { id: '6', username: 'MoonCat', email: 'mooncat@example.com', role: 'creator', status: 'active', uploads: 27, joined: '2025-08-03' },
  { id: '7', username: 'NightRaven', email: 'raven@example.com', role: 'user', status: 'active', uploads: 1, joined: '2026-02-11' },
  { id: '8', username: 'BannedBot12', email: 'bannedbot@example.com', role: 'user', status: 'banned', uploads: 0, joined: '2025-07-22' }
]

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const UsersPage = () => {
  const [searchValue, setSearchValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const itemsPerPage = 4
  const totalEntriesCount = 14205

  const filteredUserRecords = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    if (normalizedSearchValue.length === 0) {
      return allUserRecords
    }

    return allUserRecords.filter((userRecord) => {
      return (
        userRecord.username.toLowerCase().includes(normalizedSearchValue) ||
        userRecord.email.toLowerCase().includes(normalizedSearchValue)
      )
    })
  }, [searchValue])

  const totalPages = Math.max(1, Math.ceil(filteredUserRecords.length / itemsPerPage))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedUserRecords = useMemo(() => {
    const offset = (safeCurrentPage - 1) * itemsPerPage
    return filteredUserRecords.slice(offset, offset + itemsPerPage)
  }, [filteredUserRecords, safeCurrentPage])

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
    setCurrentPage(1)
  }

  const handlePreviousPage = () => {
    if (safeCurrentPage <= 1) {
      return
    }

    setCurrentPage((previousPage) => previousPage - 1)
  }

  const handleNextPage = () => {
    if (safeCurrentPage >= totalPages) {
      return
    }

    setCurrentPage((previousPage) => previousPage + 1)
  }

  const visibleStart = filteredUserRecords.length === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage + 1
  const visibleEnd = Math.min(safeCurrentPage * itemsPerPage, filteredUserRecords.length)

  return (
    <AdminPageShell activeKey="users">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">User Management</h1>

        <label className="group inline-flex h-11 w-full max-w-[330px] items-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-[#6e809d] transition focus-within:border-ember-300 sm:w-[330px]">
          <span aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search users..."
            aria-label="Search users"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#7585a1]"
          />
        </label>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">User</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Role</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Uploads</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Joined</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedUserRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No users found for your search.
                  </td>
                </tr>
              ) : (
                paginatedUserRecords.map((userRecord) => <AdminUserTableRow key={userRecord.id} userRecord={userRecord} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6f809d]">
            Showing {visibleStart} to {visibleEnd} of {totalEntriesCount.toLocaleString()} entries
          </p>

          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={safeCurrentPage <= 1}
              className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 px-4 text-sm text-[#7f8ea7] transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Go to previous users page"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={safeCurrentPage >= totalPages}
              className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 px-4 text-sm text-[#7f8ea7] transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Go to next users page"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default UsersPage
