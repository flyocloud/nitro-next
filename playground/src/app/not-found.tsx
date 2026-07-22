// Deliberately does NOT publish language-switcher links.
//
// In the App Router the root not-found boundary is rendered on *every* request
// (not only on real 404s) and renders synchronously — ahead of a route's
// awaited CMS fetch. The language-links store is first-write-wins, so publishing
// here would settle it with the fallback before the real page/entity links
// arrive, and pages that *do* have translations would show the home/fallback
// links. The Flyo page/entity helpers publish the fallback themselves before
// every `notFound()`, so a genuine 404 has the store settled without any code
// here. See UPGRADE.md → "Routes that Flyo does not resolve".
function NotFoundPage() {
	return <h1>Page not found</h1>
}

export default NotFoundPage
