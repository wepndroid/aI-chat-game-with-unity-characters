'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { useAuth } from '@/components/providers/auth-provider'
import AdminUserTableRow, { type AdminUserTableRecord } from '@/components/ui-elements/admin-user-table-row'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type { AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import { useEffect, useMemo, useState } from 'react'

type UserRoleApi = 'USER' | 'CREATOR' | 'ADMIN'
type UserFilterRole = 'ALL' | AdminUserRole
type UserSortBy = 'joined' | 'username' | 'email' | 'role' | 'status' | 'uploads'
type UserSortDirection = 'asc' | 'desc'
type TierOptionValue = 'auto' | 'free' | 'basic' | 'premium'
type UserAccountUpdatePayload = {
  email?: string
  username?: string
  password?: string
  tierCode?: 'free' | 'basic' | 'premium' | null
}

type PatreonDebugResponse = {
  data: {
    user: {
      id: string
      email: string
      username: string
    }
    patreonAccount: {
      id: string
      patreonUserId: string
      campaignMemberId: string | null
      tierCents: number | null
      monthlyTierCents: number
      pledgeCadenceMonths: number
      membershipStatus: string | null
      lastChargeStatus: string | null
      lastChargeDate: string | null
      nextChargeDate: string | null
      tokenExpiresAt: string | null
      lastCheckedAt: string | null
      createdAt: string
      updatedAt: string
    } | null
    entitlements: Array<{
      id: string
      tierCode: string
      status: string
      validFrom: string | null
      validUntil: string | null
      updatedAt: string
    }>
    logs: Array<{
      id: string
      source: string
      eventType: string
      level: 'INFO' | 'WARN' | 'ERROR'
      message: string
      actorUserId: string | null
      actorLabel: string | null
      details: unknown
      createdAt: string
    }>
  }
}

type UsersListResponse = {
  data: {
    records: Array<{
      id: string
      email: string
      username: string
      avatarUrl: string | null
      role: UserRoleApi
      isEmailVerified: boolean
      isBanned: boolean
      createdAt: string
      uploadsCount: number
      patreonLinked: boolean
      patreonMembershipStatus: string | null
      patreonLastCheckedAt: string | null
      tierCents: number | null
      tierCode: string
      manualTierCode: string | null
      quota: AdminUserTableRecord['quota']
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

const formatDateTime = (isoDate: string | null | undefined) => {
  if (!isoDate) {
    return '—'
  }

  const parsedDate = new Date(isoDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return '—'
  }

  return parsedDate.toLocaleString()
}

const formatBillingAmount = (tierCents: number | null | undefined) => {
  if (!tierCents || tierCents <= 0) {
    return '—'
  }

  return `EUR ${(tierCents / 100).toFixed(2)}`
}

const formatStatusLabel = (value: string | null | undefined) => {
  if (!value) {
    return '—'
  }

  return value.replace(/_/g, ' ')
}

const formatPatreonJson = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'No details'
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const mapManualTierCodeToOptionValue = (tierCode: string | null | undefined): TierOptionValue => {
  if (tierCode === 'premium' || tierCode === 'basic' || tierCode === 'free') {
    return tierCode
  }

  return 'auto'
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
    avatarUrl: record.avatarUrl,
    role: roleApiToUiMap[record.role],
    status,
    isEmailVerified: record.isEmailVerified,
    uploads: record.uploadsCount,
    joined: formatDate(record.createdAt),
    tierCents: record.tierCents,
    tierCode: record.tierCode,
    manualTierCode: record.manualTierCode,
    patreonLinked: record.patreonLinked,
    patreonMembershipStatus: record.patreonMembershipStatus,
    quota: record.quota
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

const sortDirectionLabelMap: Record<UserSortDirection, string> = {
  asc: 'ascending',
  desc: 'descending'
}

type SortableHeaderProps = {
  label: string
  sortBy: UserSortBy
  activeSortBy: UserSortBy
  sortDirection: UserSortDirection
  onSort: (sortBy: UserSortBy) => void
  className?: string
}

const SortableHeader = ({
  label,
  sortBy,
  activeSortBy,
  sortDirection,
  onSort,
  className = ''
}: SortableHeaderProps) => {
  const isActive = sortBy === activeSortBy
  const ariaSort = isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
  const nextDirectionLabel = isActive && sortDirection === 'asc' ? 'descending' : 'ascending'

  return (
    <th
      aria-sort={ariaSort}
      className={`px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px] ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortBy)}
        className="inline-flex items-center gap-1.5 text-left transition hover:text-white focus:outline-none focus-visible:text-white"
        aria-label={`Sort users by ${label} ${nextDirectionLabel}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${isActive ? 'text-ember-300' : 'text-white/32'}`} aria-hidden="true">
          {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

const StaticHeader = ({ label, className = '' }: { label: string; className?: string }) => {
  return (
    <th className={`px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px] ${className}`}>
      {label}
    </th>
  )
}

const UsersPage = () => {
  const { sessionUser } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserFilterRole>('ALL')
  const [sortBy, setSortBy] = useState<UserSortBy>('joined')
  const [sortDirection, setSortDirection] = useState<UserSortDirection>('desc')
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
  const [editTierOption, setEditTierOption] = useState<TierOptionValue>('auto')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [reloadUsersToken, setReloadUsersToken] = useState(0)
  const [patreonDebugUserId, setPatreonDebugUserId] = useState<string | null>(null)
  const [patreonDebugData, setPatreonDebugData] = useState<PatreonDebugResponse['data'] | null>(null)
  const [isPatreonDebugLoading, setIsPatreonDebugLoading] = useState(false)
  const [isPatreonSyncingAdmin, setIsPatreonSyncingAdmin] = useState(false)
  const [isPatreonDisconnectingAdmin, setIsPatreonDisconnectingAdmin] = useState(false)

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

          query.set('sortBy', sortBy)
          query.set('sortDirection', sortDirection)

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
  }, [itemsPerPage, reloadUsersToken, roleFilter, safeCurrentPage, searchValue, sortBy, sortDirection])

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
    setCurrentPage(1)
  }

  const handleRoleFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(event.target.value as UserFilterRole)
    setCurrentPage(1)
  }

  const handleSort = (nextSortBy: UserSortBy) => {
    setCurrentPage(1)
    if (sortBy === nextSortBy) {
      setSortDirection((previousDirection) => (previousDirection === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(nextSortBy)
    setSortDirection(nextSortBy === 'joined' ? 'desc' : 'asc')
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
    setEditTierOption(mapManualTierCodeToOptionValue(selectedUser.manualTierCode))
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
    payload.tierCode = editTierOption === 'auto' ? null : editTierOption

    setIsSavingEdit(true)
    setErrorMessage(null)
    try {
      const result = await apiPatch<{ data: { id: string; username: string; email: string; tierCode: string | null } }>(
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
                manualTierCode: result.data.tierCode
              }
            : record
        )
      )
      setEditingUserId(null)
      setReloadUsersToken((currentValue) => currentValue + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update user details.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const loadPatreonDebug = async (userId: string) => {
    setIsPatreonDebugLoading(true)

    try {
      const payload = await apiGet<PatreonDebugResponse>(`/users/${encodeURIComponent(userId)}/patreon-debug`)
      setPatreonDebugData(payload.data)
      setErrorMessage(null)
    } catch (error) {
      setPatreonDebugData(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load Patreon debug details.')
    } finally {
      setIsPatreonDebugLoading(false)
    }
  }

  const handleOpenPatreonDebug = (userId: string) => {
    setPatreonDebugUserId(userId)
    setPatreonDebugData(null)
    void loadPatreonDebug(userId)
  }

  const handleClosePatreonDebug = () => {
    setPatreonDebugUserId(null)
    setPatreonDebugData(null)
  }

  const handleAdminPatreonSync = async () => {
    if (!patreonDebugUserId) {
      return
    }

    setIsPatreonSyncingAdmin(true)
    try {
      await apiPost(`/users/${encodeURIComponent(patreonDebugUserId)}/patreon/sync`, {})
      await loadPatreonDebug(patreonDebugUserId)
      setReloadUsersToken((currentValue) => currentValue + 1)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sync Patreon for this user.')
    } finally {
      setIsPatreonSyncingAdmin(false)
    }
  }

  const handleAdminPatreonDisconnect = async () => {
    if (!patreonDebugUserId) {
      return
    }

    if (typeof window !== 'undefined' && !window.confirm('Disconnect Patreon for this user? This removes the saved Patreon link and entitlement.')) {
      return
    }

    setIsPatreonDisconnectingAdmin(true)
    try {
      await apiPost(`/users/${encodeURIComponent(patreonDebugUserId)}/patreon/disconnect`, {})
      await loadPatreonDebug(patreonDebugUserId)
      setReloadUsersToken((currentValue) => currentValue + 1)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to disconnect Patreon for this user.')
    } finally {
      setIsPatreonDisconnectingAdmin(false)
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
          <table className="min-w-[980px] w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <SortableHeader label="User" sortBy="username" activeSortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Role" sortBy="role" activeSortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Status" sortBy="status" activeSortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                <StaticHeader label="Tier" />
                <SortableHeader label="Uploads" sortBy="uploads" activeSortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                <StaticHeader label="Quota" />
                <SortableHeader label="Joined" sortBy="joined" activeSortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-[13px] font-normal text-[#8ea0bf] sm:px-4 sm:py-4 sm:text-[14px]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-[#7c8aa3] sm:px-4">
                    Loading users...
                  </td>
                </tr>
              ) : userRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-[#7c8aa3] sm:px-4">
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
                    onOpenPatreonDebug={handleOpenPatreonDebug}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6f809d]">
            Showing {visibleStart} to {visibleEnd} of {totalEntriesCount.toLocaleString()} entries · Sorted by {sortBy} {sortDirectionLabelMap[sortDirection]}
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
                <option value="auto">Auto (Patreon/entitlement)</option>
                <option value="free">Free override</option>
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
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
      {patreonDebugUserId ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6" role="presentation">
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
            <div className="w-full max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border border-white/15 bg-[#12161c] p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-heading)] text-[24px] font-normal text-white">Patreon Debug</h2>
                    <p className="mt-1 text-sm text-[#8ea0bf]">
                      {patreonDebugData ? `${patreonDebugData.user.username} - ${patreonDebugData.user.email}` : 'Loading Patreon details...'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void (patreonDebugUserId ? loadPatreonDebug(patreonDebugUserId) : Promise.resolve())}
                    disabled={isPatreonDebugLoading}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white disabled:opacity-60"
                  >
                    {isPatreonDebugLoading ? 'Refreshing...' : 'Refresh Debug'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdminPatreonSync()}
                    disabled={isPatreonSyncingAdmin || isPatreonDebugLoading}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-60"
                  >
                    {isPatreonSyncingAdmin ? 'Syncing...' : 'Force Sync'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdminPatreonDisconnect()}
                    disabled={isPatreonDisconnectingAdmin || isPatreonDebugLoading}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-rose-400/35 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-100 disabled:opacity-60"
                  >
                    {isPatreonDisconnectingAdmin ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClosePatreonDebug}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              {isPatreonDebugLoading && !patreonDebugData ? (
                <p className="mt-6 text-sm text-[#8ea0bf]">Loading Patreon debug details...</p>
              ) : patreonDebugData ? (
                <div className="mt-5 space-y-5">
                  <section className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Connection</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {patreonDebugData.patreonAccount ? 'Linked' : 'Not linked'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Membership</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {formatStatusLabel(patreonDebugData.patreonAccount?.membershipStatus)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Monthly Tier</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {formatBillingAmount(patreonDebugData.patreonAccount?.monthlyTierCents ?? null)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Last Check</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {formatDateTime(patreonDebugData.patreonAccount?.lastCheckedAt)}
                      </p>
                    </div>
                  </section>

                  <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-4">
                      <h3 className="text-sm font-semibold text-white">Patreon Account</h3>
                      {patreonDebugData.patreonAccount ? (
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Patreon User ID</dt>
                            <dd className="mt-1 break-all text-sm text-white/90">{patreonDebugData.patreonAccount.patreonUserId}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Campaign Member ID</dt>
                            <dd className="mt-1 break-all text-sm text-white/90">{patreonDebugData.patreonAccount.campaignMemberId ?? '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Raw Charge Amount</dt>
                            <dd className="mt-1 text-sm text-white/90">{formatBillingAmount(patreonDebugData.patreonAccount.tierCents)}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Billing Cadence</dt>
                            <dd className="mt-1 text-sm text-white/90">
                              {patreonDebugData.patreonAccount.pledgeCadenceMonths > 1
                                ? `${patreonDebugData.patreonAccount.pledgeCadenceMonths} months`
                                : 'Monthly'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Last Charge Status</dt>
                            <dd className="mt-1 text-sm text-white/90">{formatStatusLabel(patreonDebugData.patreonAccount.lastChargeStatus)}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Next Charge Date</dt>
                            <dd className="mt-1 text-sm text-white/90">{formatDateTime(patreonDebugData.patreonAccount.nextChargeDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Last Charge Date</dt>
                            <dd className="mt-1 text-sm text-white/90">{formatDateTime(patreonDebugData.patreonAccount.lastChargeDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.08em] text-white/40">Token Expires</dt>
                            <dd className="mt-1 text-sm text-white/90">{formatDateTime(patreonDebugData.patreonAccount.tokenExpiresAt)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-3 text-sm text-[#8ea0bf]">No Patreon account is stored for this user.</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-white/10 bg-[#0b0f14] p-4">
                      <h3 className="text-sm font-semibold text-white">Entitlements</h3>
                      {patreonDebugData.entitlements.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {patreonDebugData.entitlements.map((entitlement) => (
                            <div key={entitlement.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                              <p className="text-sm font-semibold text-white">{entitlement.tierCode}</p>
                              <p className="mt-1 text-xs text-white/65">{entitlement.status}</p>
                              <p className="mt-1 text-xs text-white/55">Valid until: {formatDateTime(entitlement.validUntil)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-[#8ea0bf]">No Patreon entitlements recorded.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#0b0f14] p-4">
                    <h3 className="text-sm font-semibold text-white">Sync Logs</h3>
                    {patreonDebugData.logs.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {patreonDebugData.logs.map((logItem) => (
                          <div key={logItem.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-semibold text-white">{logItem.message}</p>
                              <p className="text-xs text-white/50">{formatDateTime(logItem.createdAt)}</p>
                            </div>
                            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-white/45">
                              {logItem.level} • {formatStatusLabel(logItem.source)} • {formatStatusLabel(logItem.eventType)}
                              {logItem.actorLabel ? ` • actor: ${logItem.actorLabel}` : ''}
                            </p>
                            <pre className="mt-3 overflow-x-auto rounded-md border border-white/8 bg-black/25 p-3 text-xs leading-5 text-[#b8c5da]">
                              {formatPatreonJson(logItem.details)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-[#8ea0bf]">No Patreon sync logs have been recorded yet.</p>
                    )}
                  </section>
                </div>
              ) : (
                <p className="mt-6 text-sm text-[#8ea0bf]">No Patreon debug data available.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  )
}

export default UsersPage
