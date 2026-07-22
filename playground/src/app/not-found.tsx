import { getLanguageLinks, publishLanguageLinks } from '@flyo/nitro-next/server'
import { flyo } from '@/flyo.config'

async function NotFoundPage() {
	// This route renders the shared footer switcher but does not go through the
	// Flyo page/entity helpers, so publish a fallback ourselves — otherwise
	// `readLanguageLinks()` in the footer would wait forever. There is no page
	// translation here, so emit fallback entries for every configured locale.
	const currentLang = await flyo.getRequestLocale()
	publishLanguageLinks(getLanguageLinks(undefined, { currentLang, locales: flyo.state.locales }))

	return <h1>Page not found</h1>
}

export default NotFoundPage