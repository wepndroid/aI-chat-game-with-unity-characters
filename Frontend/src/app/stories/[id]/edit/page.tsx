import EditStoryPage from '@/components/stories/edit-story-page'

type EditStoryRouteProps = {
  params: Promise<{ id: string }>
}

const EditStoryRoute = async ({ params }: EditStoryRouteProps) => {
  const { id } = await params

  return <EditStoryPage storyId={id} />
}

export default EditStoryRoute
