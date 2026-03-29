'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { useAuth } from '@/components/providers/auth-provider'
import AdminUserTableRow, { type AdminUserTableRecord } from '@/components/ui-elements/admin-user-table-row'
import { apiGet, apiPatch } from '@/lib/api-client'
import type { AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import { useEffect, useMemo, useState } from 'react'

type UserRoleApi = 'USER' | 'CREATOR' | 'ADMIN'
type UserFilterRole = 'ALL' | AdminUserRole

type UsersListResponse = {
  data: {
    records: Array<{
      id: string
      email: string
      username: string
      role: UserRoleApi
      isEmailVerified: boolean
      isBanned: boolean
      createdAt: string
      uploadsCount: number
    }>
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

const roleUiToApiMap: Record<AdminUserRole, UserRoleApi> = {
  user: 'USER',
  creator: 'CREATOR',
  admin: 'ADMIN'
}

const roleApiToUiMap: Record<UserRoleApi, AdminUserRole> = {
  USER: 'user',
  CREATOR: 'creator',
  ADMIN: 'admin'
}

const formatDate = (isoDate: string) => {
  return new Date(isoDate).toISOString().slice(0, 10)
}

const mapRecordToTable = (record: UsersListResponse['data']['records'][number]): AdminUserTableRecord => {
  const status: AdminUserTableRecord['status'] = record.isBanned
    ? 'banned'
    : record.isEmailVerified
      ? 'active'
      : 'unverified'

  return {
    id: record.id,
    username: record.username,
    email: record.email,
    role: roleApiToUiMap[record.role],
    status,
    isEmailVerified: record.isEmailVerified,
    uploads: record.uploadsCount,
    joined: formatDate(record.createdAt)
  }
}

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const UsersPage = () => {
  const { sessionUser } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserFilterRole>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [userRecords, setUserRecords] = useState<AdminUserTableRecord[]>([])
  const [totalEntriesCount, setTotalEntriesCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [updatingBanUserId, setUpdatingBanUserId] = useState<string | null>(null)

  const itemsPerPage = 10
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages))

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
    }
  }, [currentPage, safeCurrentPage])

  useEffect(() => {
    let isCancelled = false
    const timeoutId = setTimeout(() => {
      Promise.resolve().then(async () => {
        setIsLoading(true)

        try {
          const query = new URLSearchParams({
            page: String(safeCurrentPage),
            limit: String(itemsPerPage)
          })

          const normalizedSearchValue = searchValue.trim()
          if (normalizedSearchValue.length > 0) {
            query.set('search', normalizedSearchValue)
          }

          if (roleFilter !== 'ALL') {
            query.set('role', roleUiToApiMap[roleFilter])
          }

          const payload = await apiGet<UsersListResponse>(`/users?${query.toString()}`)

          if (isCancelled) {
            return
          }

          setUserRecords(payload.data.records.map(mapRecordToTable))
          setTotalEntriesCount(payload.data.pagination.total)
          setTotalPages(Math.max(1, payload.data.pagination.totalPages))
          setErrorMessage(null)
        } catch (error) {
          if (!isCancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load users.')
            setUserRecords([])
            setTotalEntriesCount(0)
            setTotalPages(1)
          }
        } finally {
          if (!isCancelled) {
            setIsLoading(false)
          }
        }
      })
    }, 220)

    return () => {
      isCancelled = true
      clearTimeout(timeoutId)
    }
  }, [itemsPerPage, roleFilter, safeCurrentPage, searchValue])

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
    setCurrentPage(1)
  }

  const handleRoleFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(event.target.value as UserFilterRole)
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

  const handleUpdateRole = async (userId: string, nextRole: AdminUserRole) => {
    setUpdatingUserId(userId)
    setErrorMessage(null)

    try {
      const payload = await apiPatch<{ data: { id: string; role: UserRoleApi } }>(`/users/${encodeURIComponent(userId)}/role`, {
        role: roleUiToApiMap[nextRole]
      })

      setUserRecords((previousRecords) =>
        previousRecords.map((record) => {
          if (record.id !== payload.data.id) {
            return record
          }

          return {
            ...record,
            role: roleApiToUiMap[payload.data.role]
          }
        })
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update user role.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  const handleToggleBan = async (userId: string, banned: boolean) => {
    setUpdatingBanUserId(userId)
    setErrorMessage(null)

    try {
      const payload = await apiPatch<{ data: { id: string; isBanned: boolean } }>(
        `/users/${encodeURIComponent(userId)}/banned`,
        { banned }
      )

      setUserRecords((previousRecords) =>
        previousRecords.map((record) => {
          if (record.id !== payload.data.id) {
            return record
          }

          return {
            ...record,
            status: payload.data.isBanned ? 'banned' : record.isEmailVerified ? 'active' : 'unverified'
          }
        })
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update ban status.')
    } finally {
      setUpdatingBanUserId(null)
    }
  }

  const visibleStart = userRecords.length === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage + 1
  const visibleEnd = Math.min(safeCurrentPage * itemsPerPage, totalEntriesCount)

  const roleFilterOptionList = useMemo(
    () =>
      [
        { value: 'ALL', label: 'All Roles' },
        { value: 'user', label: 'User' },
        { value: 'creator', label: 'Creator' },
        { value: 'admin', label: 'Admin' }
      ] as const,
    []
  )

  return (
    <AdminPageShell activeKey="users">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">User Management</h1>

        <div className="flex w-full max-w-[520px] flex-col gap-3 sm:w-auto sm:flex-row">
          <label className="group inline-flex h-11 w-full items-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-[#6e809d] transition focus-within:border-ember-300 sm:w-[330px]">
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
          <select
            value={roleFilter}
            onChange={handleRoleFilterChange}
            className="h-11 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-sm text-white outline-none transition focus:border-ember-300 sm:w-[170px]"
            aria-label="Filter users by role"
          >
            {roleFilterOptionList.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

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
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    Loading users...
                  </td>
                </tr>
              ) : userRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No users found for your search.
                  </td>
                </tr>
              ) : (
                userRecords.map((userRecord) => (
                  <AdminUserTableRow
                    key={`${userRecord.id}:${userRecord.role}:${userRecord.status}`}
                    userRecord={userRecord}
                    isUpdatingRole={updatingUserId === userRecord.id}
                    isUpdatingBan={updatingBanUserId === userRecord.id}
                    currentAdminUserId={sessionUser?.id ?? null}
                    onUpdateRole={handleUpdateRole}
                    onToggleBan={handleToggleBan}
                  />
                ))
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
