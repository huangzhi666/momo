import { ArticleView } from '@/components/reader/article-view'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ArticleView articleId={id} />
}
