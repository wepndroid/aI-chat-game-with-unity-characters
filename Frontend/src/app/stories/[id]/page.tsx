import StoryDetailPage from '@/components/stories/story-detail-page'

type StoryDetailRouteProps = {
  params: Promise<{ id: string }>
}

const StoryDetailRoute = async ({ params }: StoryDetailRouteProps) => {
  const { id } = await params

  return <StoryDetailPage storyId={id} />
}

export default StoryDetailRoute
