import CreateStoryPage from '@/components/stories/create-story-page'

type WriteScenarioPageProps = {
  params: Promise<{ id: string }>
}

const WriteScenarioPage = async ({ params }: WriteScenarioPageProps) => {
  const { id } = await params

  return <CreateStoryPage routeCharacterKey={id} />
}

export default WriteScenarioPage
