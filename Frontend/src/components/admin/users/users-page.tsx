'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { useAuth } from '@/components/providers/auth-provider'
import AdminUserTableRow, { type AdminUserTableRecord } from '@/components/ui-elements/admin-user-table-row'
import { apiGet, apiPatch } from '@/lib/api-client'
import type { AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import { useEffect, useMemo, useState } from 'react'

type UserRoleApi = 'USER' | 'CREATOR' | 'ADMIN'
type UserFilterRole = 'ALL' | AdminUserRole
type TierOptionValue = '0' | '900' | '1650'
type UserAccountUpdatePayload = {
  email?: string
  username?: string
  password?: string
  tierCents?: number | null
}

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
      tierCents: number | null
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

const mapTierCentsToOptionValue = (tierCents: number | null): TierOptionValue => {
  if (tierCents !== null && tierCents >= 1650) {
    return '1650'
  }

  if (tierCents !== null && tierCents >= 900) {
    return '900'
  }

  return '0'
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
    joined: formatDate(record.createdAt),
    tierCents: record.tierCents
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
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editTierOption, setEditTierOption] = useState<TierOptionValue>('0')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

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

  const handleOpenEdit = (userId: string) => {
    const selectedUser = userRecords.find((record) => record.id === userId)
    if (!selectedUser) {
      return
    }

    setEditingUserId(userId)
    setEditUsername(selectedUser.username)
    setEditEmail(selectedUser.email)
    setEditPassword('')
    setEditTierOption(mapTierCentsToOptionValue(selectedUser.tierCents))
    setErrorMessage(null)
  }

  const handleSaveEdit = async () => {
    if (!editingUserId) {
      return
    }

    const payload: UserAccountUpdatePayload = {}
    const username = editUsername.trim()
    const email = editEmail.trim().toLowerCase()
    const password = editPassword.trim()

    if (username.length >= 3) {
      payload.username = username
    }
    if (email.length > 0) {
      payload.email = email
    }
    if (password.length > 0) {
      payload.password = password
    }
    payload.tierCents = Number.parseInt(editTierOption, 10)

    setIsSavingEdit(true)
    setErrorMessage(null)
    try {
      const result = await apiPatch<{ data: { id: string; username: string; email: string; tierCents: number | null } }>(
        `/users/${encodeURIComponent(editingUserId)}/account`,
        payload
      )

      setUserRecords((previousRecords) =>
        previousRecords.map((record) =>
          record.id === result.data.id
            ? {
                ...record,
                username: result.data.username,
                email: result.data.email,
                tierCents: result.data.tierCents
              }
            : record
        )
      )
      setEditingUserId(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update user details.')
    } finally {
      setIsSavingEdit(false)
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
        <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
          User Management
        </h1>

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
        <div className="-mx-px overflow-x-auto sm:mx-0">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">User</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Role</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Status</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Tier</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Uploads</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Joined</th>
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-[#7c8aa3] sm:px-4">
                    Loading users...
                  </td>
                </tr>
              ) : userRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-[#7c8aa3] sm:px-4">
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
                    onEditDetails={handleOpenEdit}
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
      {editingUserId ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6" role="presentation">
          <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
            <div className="w-full max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border border-white/15 bg-[#12161c] p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-[24px] font-normal text-white">Edit User Details</h2>
            <p className="mt-1 text-sm text-[#8ea0bf]">Update account fields and assign membership tier.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={editUsername}
                onChange={(event) => setEditUsername(event.target.value)}
                placeholder="Username"
                className="h-11 rounded-md border border-white/20 bg-[#0b0f14] px-3 text-sm text-white outline-none focus:border-ember-300"
              />
              <input
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                placeholder="Email"
                className="h-11 rounded-md border border-white/20 bg-[#0b0f14] px-3 text-sm text-white outline-none focus:border-ember-300"
              />
              <input
                value={editPassword}
                onChange={(event) => setEditPassword(event.target.value)}
                placeholder="New password (optional)"
                type="password"
                className="h-11 rounded-md border border-white/20 bg-[#0b0f14] px-3 text-sm text-white outline-none focus:border-ember-300"
              />
              <select
                value={editTierOption}
                onChange={(event) => setEditTierOption(event.target.value as TierOptionValue)}
                className="h-11 rounded-md border border-white/20 bg-[#0b0f14] px-3 text-sm text-white outline-none focus:border-ember-300"
                aria-label="Membership tier"
              >
                <option value="0">Free</option>
                <option value="900">Basic</option>
                <option value="1650">Premium</option>
              </select>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-60"
              >
                {isSavingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
              >
                Cancel
              </button>
            </div>
          </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  )
}

export default UsersPage
