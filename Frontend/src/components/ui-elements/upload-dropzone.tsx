type UploadDropzoneProps = {
  onFileSelect: (file: File | null) => void
  selectedFileName: string | null
}

const UploadDropzone = ({ onFileSelect, selectedFileName }: UploadDropzoneProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    onFileSelect(nextFile)
  }

  return (
    <label className="relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-black/25 text-center transition hover:border-ember-300/65">
      <input type="file" accept=".vrm,model/vrm" className="sr-only" onChange={handleInputChange} aria-label="Upload VRM file" />
      <p className="font-[family-name:var(--font-heading)] text-2xl font-normal italic text-white">
        {selectedFileName ? selectedFileName : 'Drop your .VRM file here'}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Max file size: 100MB</p>
    </label>
  )
}

export default UploadDropzone
