import StoryToCharacterRedirect from '@/components/stories/story-to-character-redirect'

type StoryIdRouteProps = {
  params: Promise<{ id: string }>
}

const StoryIdRoute = async ({ params }: StoryIdRouteProps) => {
  const { id } = await params

  return <StoryToCharacterRedirect storyId={id} />
}

export default StoryIdRoute
