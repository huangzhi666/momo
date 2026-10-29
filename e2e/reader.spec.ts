import { expect, test } from '@playwright/test'

test.describe('LexiLoop 阅读闭环（Demo）', () => {
  test('打开 Demo 文章、点生词、查看词卡、模拟加词', async ({ page }) => {
    const response = await page.request.get('/api/articles?kind=demo')
    expect(response.ok()).toBeTruthy()
    const data = (await response.json()) as {
      articles: { id: string; title: string }[]
    }
    const demo = data.articles.find((item) => item.title === 'The Puncture') ?? data.articles[0]
    expect(demo).toBeTruthy()
    await page.goto(`/article/${demo.id}`)
    await expect(page.locator('.reader-title')).toBeVisible()

    // 生词必须有点状下划线样式，并且可点击
    const newToken = page.locator('.tok-new').first()
    await expect(newToken).toBeVisible()
    const underline = await newToken.evaluate((element) => getComputedStyle(element).textDecorationStyle)
    expect(underline).toBe('dotted')

    const word = (await newToken.textContent())?.trim() ?? ''
    await newToken.click()
    const addButton = page.getByRole('button', { name: '加入墨墨学习', exact: true })
    await expect(addButton).toBeVisible({ timeout: 10_000 })
    await addButton.click()
    await expect(page.getByRole('button', { name: /已在词库/ }).first()).toBeVisible({
      timeout: 15_000,
    })

    // 顶部指标仍在
    await expect(page.getByText('生词密度')).toBeVisible()
    await expect(page.locator('.tok-new').first()).toBeVisible()
    console.log('tested word:', word)
  })

  test('分析页可以分析一段英文并进入阅读器', async ({ page }) => {
    await page.goto('/import')
    await page.getByRole('button', { name: '填入示例' }).click()
    await page.getByRole('button', { name: /分析并打开阅读器/ }).click()
    await expect(page).toHaveURL(/\/article\//, { timeout: 30_000 })
    await expect(page.locator('.reader-title')).toBeVisible()
    await expect(page.locator('.article-body')).toContainText('rain')
  })
})
