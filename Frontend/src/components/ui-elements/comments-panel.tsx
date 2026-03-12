type CommentsPanelProps = {
  username: string
  postAge: string
  message: string
}

const CommentsPanel = ({ username, postAge, message }: CommentsPanelProps) => {
  return (
    <section className="rounded-md border border-white/10 bg-[#121010] p-5">
      <h3 className="font-[family-name:var(--font-heading)] text-[26px] font-semibold italic text-white">COMMENTS</h3>
      <div className="mt-4 rounded-sm border border-white/10 bg-[#0d0d0d] p-4">
        <p className="text-[11px] font-semibold text-white/80">
          {username} <span className="text-white/45">{postAge}</span>
        </p>
        <p className="mt-2 text-[11px] leading-[1.45] text-white/65">{message}</p>
      </div>
    </section>
  )
}

export default CommentsPanel
