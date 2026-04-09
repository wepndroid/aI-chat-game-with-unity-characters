import { redirect } from 'next/navigation'

/** Stories are surfaced on each character page; the old hub URL forwards here. */
export default function StoriesIndexPage() {
  redirect('/characters')
}
