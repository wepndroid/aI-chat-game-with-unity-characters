import CharacterPage from '@/components/character/character-page'

type CharacterDetailPageProps = {
  params: Promise<{ id: string }>
}

const CharacterDetailPage = async ({ params }: CharacterDetailPageProps) => {
  const resolvedParams = await params
  return <CharacterPage characterId={resolvedParams.id} />
}

export default CharacterDetailPage
