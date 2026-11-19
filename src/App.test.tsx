import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import i18n from './i18n'

describe('main application shell', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ar')
  })

  it('starts in Arabic with right-to-left layout and switches to English', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.app-shell')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('heading', { name: 'نظرة عامة' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'التبديل إلى الإنجليزية' }))

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).toHaveAttribute('dir', 'ltr')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })

  it('toggles the color theme and opens a selected section', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'تبديل الوضع الداكن والفاتح' }))
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')

    await user.click(screen.getByRole('button', { name: 'المخزون' }))
    expect(screen.getByRole('heading', { name: 'المخزون', level: 1 })).toBeInTheDocument()
  })
})
