import EditStoryPage from '@/components/stories/edit-story-page'

type EditScenarioPageProps = {
  params: Promise<{ id: string; storyId: string }>
}

const EditScenarioPage = async ({ params }: EditScenarioPageProps) => {
  const { id, storyId } = await params

  return <EditStoryPage storyId={storyId} characterRouteKey={id} />
}

export default EditScenarioPage
