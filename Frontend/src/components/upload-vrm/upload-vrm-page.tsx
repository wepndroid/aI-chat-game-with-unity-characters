'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import UploadDropzone from '@/components/ui-elements/upload-dropzone'
import UploadField from '@/components/ui-elements/upload-field'
import { useState } from 'react'

type UploadVrmFormState = {
  fullName: string
  tagLine: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  isPublic: boolean
}

const initialFormState: UploadVrmFormState = {
  fullName: '',
  tagLine: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  exampleDialogue: '',
  isPublic: false
}

const UploadVrmPage = () => {
  const [formState, setFormState] = useState<UploadVrmFormState>(initialFormState)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const handleFieldChange = <T extends keyof UploadVrmFormState>(key: T, value: UploadVrmFormState[T]) => {
    setFormState((previousState) => ({
      ...previousState,
      [key]: value
    }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-6xl font-semibold italic leading-none text-white md:text-7xl">
            Upload VRM
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="upload-vrm" />

            <form onSubmit={handleSubmit} className="rounded-md border border-white/10 bg-[#1a1414]/95 p-6 md:p-10">
              <UploadDropzone onFileSelect={(file) => setSelectedFileName(file?.name ?? null)} selectedFileName={selectedFileName} />

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <UploadField label="Full Name" value={formState.fullName} onChange={(value) => handleFieldChange('fullName', value)} />
                <UploadField label="Tag line" value={formState.tagLine} onChange={(value) => handleFieldChange('tagLine', value)} />
              </div>

              <div className="mt-4">
                <UploadField
                  label="Description"
                  value={formState.description}
                  onChange={(value) => handleFieldChange('description', value)}
                  accentBorder
                />
              </div>

              <div className="mt-4 space-y-3">
                <UploadField
                  label="Personality"
                  value={formState.personality}
                  onChange={(value) => handleFieldChange('personality', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="Scenario"
                  value={formState.scenario}
                  onChange={(value) => handleFieldChange('scenario', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="First Message"
                  value={formState.firstMessage}
                  onChange={(value) => handleFieldChange('firstMessage', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="Example Dialogue"
                  value={formState.exampleDialogue}
                  onChange={(value) => handleFieldChange('exampleDialogue', value)}
                  multiline
                  tokenLimit={800}
                />
              </div>

              <label className="mt-4 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.isPublic}
                  onChange={(event) => handleFieldChange('isPublic', event.target.checked)}
                  className="size-4 rounded border border-white/30 bg-transparent text-ember-400 focus:ring-ember-300"
                  aria-label="Make character public"
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Make Character Public</span>
              </label>

              <div className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
                  aria-label="Submit VRM upload"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

export default UploadVrmPage
